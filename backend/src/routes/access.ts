/**
 * Access control / consent management routes.
 *
 * POST   /api/history/:historyId/grant          - Grant full access
 * POST   /api/history/:historyId/grant-partial  - Grant partial access (specific entries)
 * POST   /api/history/:historyId/revoke-access   - Revoke access
 * GET    /api/history/:historyId/grants          - List active grants (owner only)
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSuiClient, getAdminKeypair, getSuiObject } from '../sui/client';
import {
  buildGrantFullAccessPTB,
  buildGrantPartialAccessPTB,
  buildRevokeAccessPTB,
  executeTx,
  prepareSponsoredTransaction,
  executeSponsoredTransaction,
} from '../sui/transactions';
import { getSharedObjectIds } from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth } from '../middleware/auth';
import { getDb } from '../db';
import { recordOffchainAuditEvent } from '../audit/offchain';
import { config } from '../config';
import { wrapKeyForGrantee } from '../encryption/key-manager';

const router = Router();

async function createAccessNotification(input: {
  recipientAddr: string;
  actorAddr: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await getDb().query(
    `INSERT INTO notifications
      (recipient_addr, actor_addr, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.recipientAddr.toLowerCase(),
      input.actorAddr.toLowerCase(),
      input.type,
      input.title,
      input.message,
      JSON.stringify(input.metadata),
    ]
  );
}

async function resolveAccessRequest(
  patientAddr: string,
  requesterAddr: string,
  status: 'approved' | 'declined'
): Promise<void> {
  await getDb().query(
    `UPDATE access_requests
     SET status = $1, resolved_at = now()
     WHERE patient_addr = $2 AND requester_addr = $3 AND status = 'pending'`,
    [status, patientAddr.toLowerCase(), requesterAddr.toLowerCase()]
  );
}

async function requireHistoryOwner(historyId: string, address: string): Promise<void> {
  const history = await getSuiObject(historyId);
  const owner = history.data?.content?.fields?.owner;
  if (!owner || owner.toLowerCase() !== address.toLowerCase()) {
    throw new AppError('Only the patient who owns this history can manage access', 403);
  }
}

// ─── Schemas ────────────────────────────────────────────────

const HistoryIdParamSchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui object ID'),
});

const GrantFullSchema = z.object({
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  expiryMs: z.number().int().min(0).default(0), // 0 = never expires
  sponsored: z.boolean().default(false),
});

const GrantPartialSchema = z.object({
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  entryIds: z.array(z.number().int().min(0)).min(1),
  expiryMs: z.number().int().min(0).default(0),
  sponsored: z.boolean().default(false),
});

const RevokeAccessSchema = z.object({
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});
const PrepareGrantFullSchema = GrantFullSchema;
const PrepareGrantPartialSchema = GrantPartialSchema;
const PrepareRevokeSchema = RevokeAccessSchema;
const SponsoredExecuteSchema = z.object({
  transactionBytes: z.string().min(1),
  zkLoginSignature: z.string().min(1),
  digest: z.string().optional(),
});
const DemoGrantSchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/),
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/),
  action: z.enum(['grant', 'revoke']).default('grant'),
  scope: z.enum(['full', 'partial']).optional(),
  entryIds: z.array(z.number().int().min(0)).optional(),
  expiryMs: z.number().int().min(0).optional(),
});

async function prepareTransactionResponse(
  tx: Awaited<ReturnType<typeof buildGrantFullAccessPTB>>,
  sponsored: boolean
) {
  return {
    success: true,
    transaction: sponsored ? await prepareSponsoredTransaction(tx) : tx.serialize(),
  };
}

// ─── Routes ─────────────────────────────────────────────────

/**
 * Development-only fallback for presentations while zkLogin proving is unavailable.
 * This does not change the on-chain PermissionStore and must never be enabled in production.
 */
router.post(
  '/demo/grant',
  apiKeyAuth,
  validate({ body: DemoGrantSchema }),
  async (req, res, next) => {
    try {
      if (config.NODE_ENV === 'production') {
        throw new AppError('Demo access fallback is disabled in production', 404);
      }
      const { historyId, granteeAddr, action, scope, entryIds, expiryMs } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const digest = `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await resolveAccessRequest(
        req.user!.address,
        granteeAddr,
        action === 'grant' ? 'approved' : 'declined'
      );
      await recordOffchainAuditEvent({
        action: action === 'grant' ? 'access_grant_details' : 'access_revocation_details',
        actorAddr: req.user!.address,
        actorRole: req.user!.role,
        historyId,
        targetType: 'wallet',
        targetId: granteeAddr.toLowerCase(),
        accessScope: scope || 'full',
        result: 'success',
        metadata: { demo: true, entryIds, expiresAtMs: expiryMs, digest },
        requestId: req.requestId,
      });
      if (action === 'grant') {
        const keyRows = await getDb().query(
          `SELECT entry_id
           FROM entry_keys
           WHERE history_id = $1 AND LOWER(grantee_addr) = LOWER($2)`,
          [historyId, req.user!.address]
        );
        const grantEntryIds = scope === 'partial' && entryIds
          ? entryIds
          : keyRows.rows.map((row) => Number(row.entry_id));
        for (const entryId of grantEntryIds) {
          await wrapKeyForGrantee(historyId, entryId, granteeAddr);
        }
      } else {
        await getDb().query(
          `DELETE FROM entry_keys
           WHERE history_id = $1 AND LOWER(grantee_addr) = LOWER($2)`,
          [historyId, granteeAddr]
        );
      }
      await createAccessNotification({
        recipientAddr: granteeAddr,
        actorAddr: req.user!.address,
        type: action === 'grant' ? 'access_granted' : 'access_revoked',
        title: action === 'grant' ? 'Access granted' : 'Access revoked',
        message: action === 'grant'
          ? 'You were granted access to a patient’s medical history.'
          : 'Your access to a patient’s medical history was revoked.',
        metadata: { demo: true, historyId, scope, entryIds, expiryMs, digest },
      });

      res.json({ success: true, digest, demo: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/sponsored/execute',
  apiKeyAuth,
  validate({ body: SponsoredExecuteSchema }),
  async (req, res, next) => {
    try {
      const { transactionBytes, zkLoginSignature } = req.body;
      const result = await executeSponsoredTransaction(
        transactionBytes,
        zkLoginSignature,
        req.user?.address
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:historyId/grant/prepare',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: PrepareGrantFullSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { granteeAddr, expiryMs, sponsored } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const tx = await buildGrantFullAccessPTB(
        getSharedObjectIds(), historyId, granteeAddr, expiryMs, req.user!.address
      );
      res.json(await prepareTransactionResponse(tx, sponsored));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:historyId/grant-partial/prepare',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: PrepareGrantPartialSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { granteeAddr, entryIds, expiryMs, sponsored } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const tx = await buildGrantPartialAccessPTB(
        getSharedObjectIds(), historyId, granteeAddr, entryIds, expiryMs, req.user!.address
      );
      res.json(await prepareTransactionResponse(tx, sponsored));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:historyId/revoke-access/prepare',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: PrepareRevokeSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { granteeAddr, sponsored } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const tx = await buildRevokeAccessPTB(
        getSharedObjectIds(), historyId, granteeAddr, req.user!.address
      );
      res.json(await prepareTransactionResponse(tx, sponsored));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:historyId/access/confirm',
  apiKeyAuth,
  validate({
    params: HistoryIdParamSchema,
    body: z.object({
      digest: z.string().min(1),
      granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/),
      action: z.enum(['grant', 'revoke']),
      scope: z.enum(['full', 'partial']).optional(),
      entryIds: z.array(z.number().int().min(0)).optional(),
      expiryMs: z.number().int().min(0).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { digest, granteeAddr, action, scope, entryIds, expiryMs } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const transaction = await getSuiClient().getTransaction({
        digest,
        include: { effects: true },
      } as any);
      const status = (transaction as any).effects?.status?.status;
      if (status !== 'success') {
        throw new AppError('The signed access transaction did not succeed on-chain', 409);
      }

      if (action === 'grant') {
        await resolveAccessRequest(req.user!.address, granteeAddr, 'approved');
        await createAccessNotification({
          recipientAddr: granteeAddr,
          actorAddr: req.user!.address,
          type: 'access_granted',
          title: scope === 'partial' ? 'Partial access granted' : 'Access granted',
          message: scope === 'partial'
            ? `You were granted access to ${entryIds?.length || 0} medical history entries.`
            : "You were granted full access to a patient's medical history.",
          metadata: { historyId, scope: scope || 'full', entryIds, expiryMs, digest },
        });
      } else {
        await createAccessNotification({
          recipientAddr: granteeAddr,
          actorAddr: req.user!.address,
          type: 'access_revoked',
          title: 'Access revoked',
          message: "Your access to a patient's medical history was revoked.",
          metadata: { historyId, digest },
        });
      }
      res.json({ success: true, digest });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Grant full access to a medical history.
 * Only the history owner can do this (enforced on-chain).
 */
router.post(
  '/:historyId/grant',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: GrantFullSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { granteeAddr, expiryMs } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.permissionStore || !sharedIds.auditLog) {
        throw new AppError('Shared object IDs not configured', 500);
      }

      const tx = await buildGrantFullAccessPTB(
        sharedIds,
        historyId,
        granteeAddr,
        expiryMs
      );

      const result = await executeTx(client, tx, signer);
      await resolveAccessRequest(req.user!.address, granteeAddr, 'approved');

      await recordOffchainAuditEvent({
        action: 'access_grant_details',
        actorAddr: req.user!.address,
        actorRole: req.user!.role,
        historyId,
        targetType: 'wallet',
        targetId: granteeAddr.toLowerCase(),
        accessScope: 'full',
        result: 'success',
        metadata: { expiresAtMs: expiryMs },
        requestId: req.requestId,
      });
      await createAccessNotification({
        recipientAddr: granteeAddr,
        actorAddr: req.user!.address,
        type: 'access_granted',
        title: 'Access granted',
        message: `You were granted ${'full'} access to a patient's medical history.`,
        metadata: { historyId, scope: 'full', digest: result.digest },
      });

      res.status(201).json({
        success: true,
        digest: result.digest,
        historyId,
        granteeAddr,
        scope: 'full',
        expiryMs,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Grant partial access (specific entries only).
 * Only the history owner can do this (enforced on-chain).
 */
router.post(
  '/:historyId/grant-partial',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: GrantPartialSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { granteeAddr, entryIds, expiryMs } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      const tx = await buildGrantPartialAccessPTB(
        sharedIds,
        historyId,
        granteeAddr,
        entryIds,
        expiryMs
      );

      const result = await executeTx(client, tx, signer);
      await resolveAccessRequest(req.user!.address, granteeAddr, 'approved');

      await recordOffchainAuditEvent({
        action: 'access_grant_details',
        actorAddr: req.user!.address,
        actorRole: req.user!.role,
        historyId,
        targetType: 'wallet',
        targetId: granteeAddr.toLowerCase(),
        accessScope: 'partial',
        result: 'success',
        metadata: { expiresAtMs: expiryMs, entryCount: entryIds.length },
        requestId: req.requestId,
      });
      await createAccessNotification({
        recipientAddr: granteeAddr,
        actorAddr: req.user!.address,
        type: 'access_granted',
        title: 'Partial access granted',
        message: `You were granted access to ${entryIds.length} medical history entr${entryIds.length === 1 ? 'y' : 'ies'}.`,
        metadata: { historyId, scope: 'partial', entryIds, digest: result.digest },
      });

      res.status(201).json({
        success: true,
        digest: result.digest,
        historyId,
        granteeAddr,
        scope: 'partial',
        entryIds,
        expiryMs,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Revoke all access for a grantee.
 * Only the history owner can do this (enforced on-chain).
 */
router.post(
  '/:historyId/revoke-access',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: RevokeAccessSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { granteeAddr } = req.body;
      await requireHistoryOwner(historyId, req.user!.address);
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      const tx = await buildRevokeAccessPTB(sharedIds, historyId, granteeAddr);
      const result = await executeTx(client, tx, signer);

      await recordOffchainAuditEvent({
        action: 'access_revocation_details',
        actorAddr: req.user!.address,
        actorRole: req.user!.role,
        historyId,
        targetType: 'wallet',
        targetId: granteeAddr.toLowerCase(),
        accessScope: 'all',
        result: 'success',
        requestId: req.requestId,
      });
      await createAccessNotification({
        recipientAddr: granteeAddr,
        actorAddr: req.user!.address,
        type: 'access_revoked',
        title: 'Access revoked',
        message: 'Your access to a patient’s medical history was revoked.',
        metadata: { historyId, digest: result.digest },
      });

      res.json({
        success: true,
        digest: result.digest,
        historyId,
        granteeAddr,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

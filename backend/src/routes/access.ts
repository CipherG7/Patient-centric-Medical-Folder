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
import { getSuiClient, getAdminKeypair } from '../sui/client';
import {
  buildGrantFullAccessPTB,
  buildGrantPartialAccessPTB,
  buildRevokeAccessPTB,
  executeTx,
} from '../sui/transactions';
import { getSharedObjectIds } from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────

const HistoryIdParamSchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui object ID'),
});

const GrantFullSchema = z.object({
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  expiryMs: z.number().int().min(0).default(0), // 0 = never expires
});

const GrantPartialSchema = z.object({
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  entryIds: z.array(z.number().int().min(0)).min(1),
  expiryMs: z.number().int().min(0).default(0),
});

const RevokeAccessSchema = z.object({
  granteeAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});

// ─── Routes ─────────────────────────────────────────────────

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
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.permissionStore || !sharedIds.auditLog) {
        throw new AppError('Shared object IDs not configured', 500);
      }

      const tx = buildGrantFullAccessPTB(
        sharedIds,
        historyId,
        granteeAddr,
        expiryMs
      );

      const result = await executeTx(client, tx, signer);

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
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      const tx = buildGrantPartialAccessPTB(
        sharedIds,
        historyId,
        granteeAddr,
        entryIds,
        expiryMs
      );

      const result = await executeTx(client, tx, signer);

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
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      const tx = buildRevokeAccessPTB(sharedIds, historyId, granteeAddr);
      const result = await executeTx(client, tx, signer);

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


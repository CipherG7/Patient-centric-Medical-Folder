/**
 * Medical history entry management routes.
 *
 * POST   /api/history/:historyId/entry         - Add an entry (institution only)
 * POST   /api/history/:historyId/revoke-entry  - Revoke an entry (owner only)
 * GET    /api/history/:historyId                - Read full history (owner/grantee)
 * GET    /api/history/:historyId/entry/:entryId - Read single entry (owner/grantee)
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSuiClient, getAdminKeypair, getSuiObject } from '../sui/client';
import {
  buildAddEntryPTB,
  buildRevokeEntryPTB,
  buildReadFullHistoryPTB,
  buildReadEntryPTB,
  executeTx,
  dryRunTx,
} from '../sui/transactions';
import {
  getSharedObjectIds,
  getSharedObjectRef,
  parseEvents,
  bytesToString,
} from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth, optionalAuth } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────

const HistoryIdParamSchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui object ID'),
});

const AddEntrySchema = z.object({
  issuerAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  entryType: z.number().int().min(0).max(6), // Matches entry type codes
  offChainRef: z.string().min(1), // IPFS CID or similar URI
  contentHash: z.string().min(1), // Hex-encoded SHA-256
});

const RevokeEntrySchema = z.object({
  entryId: z.number().int().min(0),
});

const EntryIdParamSchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui object ID'),
  entryId: z.string().regex(/^\d+$/, 'Entry ID must be a number'),
});

// ─── Routes ─────────────────────────────────────────────────

/**
 * Add a new entry to a medical history.
 * The caller must be a verified institution (checked on-chain).
 */
router.post(
  '/:historyId/entry',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: AddEntrySchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { issuerAddr, entryType, offChainRef, contentHash } = req.body;
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.institutionRegistry || !sharedIds.auditLog) {
        throw new AppError('Shared object IDs not configured', 500);
      }

      // Convert hex content hash to bytes
      const hashBytes = contentHash.startsWith('0x')
        ? contentHash.slice(2)
        : contentHash;
      const hashArray = hashBytes.match(/.{1,2}/g)?.map((b: string) => parseInt(b, 16)) || [];

      const tx = buildAddEntryPTB(
        sharedIds,
        historyId,
        entryType,
        offChainRef,
        hashArray,
        {
          history: await getSharedObjectRef(client, historyId, 'MedicalHistory', true),
          institutionRegistry: await getSharedObjectRef(
            client,
            sharedIds.institutionRegistry,
            'InstitutionRegistry',
            false
          ),
          auditLog: await getSharedObjectRef(
            client,
            sharedIds.auditLog,
            'AuditLog',
            true
          ),
          clock: await getSharedObjectRef(client, '0x6', 'Clock', false),
        }
      );

      const result = await executeTx(client, tx, signer);

      // Parse the EntryAdded event
      const entryAddedEvent = parseEvents(
        result.effects?.events || [],
        'EntryAdded'
      );
      const entryId = entryAddedEvent[0]?.entry_id;

      res.status(201).json({
        success: true,
        digest: result.digest,
        historyId,
        entryId: entryId ? Number(entryId) : undefined,
        entryType,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Revoke (flag) an entry. Only the history owner can do this.
 */
router.post(
  '/:historyId/revoke-entry',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema, body: RevokeEntrySchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const { entryId } = req.body;
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      const tx = buildRevokeEntryPTB(sharedIds, historyId, entryId);
      const result = await executeTx(client, tx, signer);

      res.json({
        success: true,
        digest: result.digest,
        historyId,
        entryId,
        revoked: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Read the full medical history.
 * Access is gated by the on-chain permission system.
 */
router.get(
  '/:historyId',
  optionalAuth,
  validate({ params: HistoryIdParamSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const client = getSuiClient();
      const sharedIds = getSharedObjectIds();

      // Use dryRun (devInspectTransactionBlock) for read-only queries
      const tx = buildReadFullHistoryPTB(
        sharedIds,
        historyId,
        req.user?.address || '0x0'
      );

      // Read the on-chain MedicalHistory object directly for entry data
      const historyObj = await getSuiObject(historyId);

      if (!historyObj.data) {
        throw new AppError('MedicalHistory not found', 404);
      }

      const fields = (historyObj.data as any).content?.fields;
      const owner = fields?.owner;
      const entryCount = fields?.entry_count;
      const entries = fields?.entries?.fields?.contents || [];

      // Parse entries from the table format
      const parsedEntries = entries.map((entry: any) => {
        const e = entry.fields?.value?.fields || entry.fields?.value;
        return {
          id: Number(entry.fields?.key),
          issuer: e?.issuer,
          entryType: e?.entry_type,
          offChainRef: e?.off_chain_ref
            ? bytesToString(e.off_chain_ref)
            : null,
          contentHash: e?.content_hash
            ? Buffer.from(e.content_hash).toString('hex')
            : null,
          timestampMs: e?.timestamp_ms,
          revoked: e?.revoked,
        };
      });

      // Get off-chain metadata
      const db = getDb();
      const { rows } = await db.query(
        'SELECT * FROM history_metadata WHERE history_id = $1',
        [historyId]
      );
      const { rows: importedRows } = await db.query(
        'SELECT entry_id, source_name, record FROM history_import_entries WHERE history_id = $1',
        [historyId]
      );
      const importedById = new Map(
        importedRows.map((row) => [row.entry_id, {
          sourceName: row.source_name,
          record: row.record,
        }])
      );

      res.json({
        success: true,
        historyId,
        owner,
        entryCount: entryCount ? Number(entryCount) : 0,
        entries: parsedEntries.map((entry: any) => ({
          ...entry,
          import: importedById.get(entry.id) || null,
        })),
        metadata: rows[0] || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Read a single entry from a medical history.
 */
router.get(
  '/:historyId/entry/:entryId',
  optionalAuth,
  validate({ params: EntryIdParamSchema }),
  async (req, res, next) => {
    try {
      const { historyId, entryId } = req.params;
      const client = getSuiClient();
      const sharedIds = getSharedObjectIds();

      // Read the history object and find the specific entry
      const historyObj = await getSuiObject(historyId);

      if (!historyObj.data) {
        throw new AppError('MedicalHistory not found', 404);
      }

      const fields = (historyObj.data as any).content?.fields;
      const entries = fields?.entries?.fields?.contents || [];

      const matchedEntry = entries.find(
        (entry: any) => entry.fields?.key === entryId
      );

      if (!matchedEntry) {
        throw new AppError('Entry not found', 404);
      }

      const e = matchedEntry.fields?.value?.fields || matchedEntry.fields?.value;

      res.json({
        success: true,
        historyId,
        entryId: Number(entryId),
        entry: {
          issuer: e?.issuer,
          entryType: e?.entry_type,
          offChainRef: e?.off_chain_ref
            ? bytesToString(e.off_chain_ref)
            : null,
          contentHash: e?.content_hash
            ? Buffer.from(e.content_hash).toString('hex')
            : null,
          timestampMs: e?.timestamp_ms,
          revoked: e?.revoked,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

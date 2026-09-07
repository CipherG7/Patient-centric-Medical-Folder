/**
 * Audit log routes.
 *
 * GET    /api/history/:historyId/audit    - Fetch the full audit log for a history
 *
 * The audit log is stored on-chain in the `AuditLog` shared object,
 * keyed by history ID. It records every add, read, grant, and revoke.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSuiClient } from '../sui/client';
import { getSharedObjectIds, bytesToString } from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { optionalAuth } from '../middleware/auth';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────

const HistoryIdParamSchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui object ID'),
});

/**
 * Human-readable action labels matching the Move constants in audit_log.move.
 */
const ACTION_LABELS: Record<number, string> = {
  0: 'entry_added',
  1: 'entry_revoked',
  2: 'full_read',
  3: 'partial_read',
  4: 'access_granted',
  5: 'access_revoked',
};

function getActionLabel(action: number): string {
  return ACTION_LABELS[action] || `unknown_${action}`;
}

// ─── Routes ─────────────────────────────────────────────────

/**
 * Fetch the audit log for a medical history.
 * The audit log is stored on-chain in the AuditLog shared object.
 */
router.get(
  '/:historyId/audit',
  optionalAuth,
  validate({ params: HistoryIdParamSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const client = getSuiClient();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.auditLog) {
        throw new AppError('AuditLog shared object ID not configured', 500);
      }

      // Read the AuditLog shared object
      const auditObj = await client.getObject({
        id: sharedIds.auditLog,
        options: { showContent: true },
      });

      if (!auditObj.data) {
        throw new AppError('AuditLog not found on-chain', 404);
      }

      const fields = (auditObj.data as any).content?.fields;
      const events = fields?.events?.fields?.contents || [];

      // Find the event vector for this history
      const historyEventsEntry = events.find(
        (entry: any) => entry.fields?.key === historyId
      );

      if (!historyEventsEntry) {
        // No events yet for this history — return empty
        res.json({
          success: true,
          historyId,
          events: [],
          count: 0,
        });
        return;
      }

      // Parse the vector<AuditEvent>
      const rawEvents = historyEventsEntry.fields?.value || [];
      const parsedEvents = rawEvents.map((auditEvent: any, index: number) => {
        const e = auditEvent.fields || auditEvent;
        return {
          id: index,
          actor: e.actor || e.actor_id,
          action: e.action,
          actionLabel: getActionLabel(e.action),
          entryId: e.entry_id?.fields?.vec?.[0] ?? null, // Option<u64> → unwrap
          timestampMs: e.timestamp_ms,
        };
      });

      res.json({
        success: true,
        historyId,
        count: parsedEvents.length,
        events: parsedEvents,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;


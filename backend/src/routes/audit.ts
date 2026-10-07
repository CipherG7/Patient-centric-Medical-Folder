/**
 * Audit log routes.
 *
 * GET    /api/history/:historyId/audit    - Fetch the full audit log for a history
 *
 * On-chain contract events and application-managed off-chain events are
 * combined for display. Off-chain events are not immutable chain records.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSuiObject } from '../sui/client';
import { getSharedObjectIds, bytesToString } from '../utils/sui-helpers';
import { validate } from '../middleware/validate';
import { apiKeyAuth } from '../middleware/auth';
import { getDb } from '../db';

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
  6: 'document_deleted',
};

function getActionLabel(action: number): string {
  return ACTION_LABELS[action] || `unknown_${action}`;
}

// ─── Routes ─────────────────────────────────────────────────

/**
 * Fetch the audit log for a medical history.
 * Combine the on-chain history with off-chain application events.
 */
router.get(
  '/:historyId/audit',
  apiKeyAuth,
  validate({ params: HistoryIdParamSchema }),
  async (req, res, next) => {
    try {
      const { historyId } = req.params;
      const sharedIds = getSharedObjectIds();
      const { rows: offchainRows } = await getDb().query(
        `SELECT id, actor_addr, actor_role, action, entry_id, target_type,
                target_id, access_scope, result, metadata, request_id, occurred_at
         FROM offchain_audit_events
         WHERE history_id = $1 OR (history_id IS NULL AND actor_addr = $2)
         ORDER BY occurred_at DESC`,
        [historyId, req.user!.address.toLowerCase()]
      );

      let onchainEvents: any[] = [];
      if (sharedIds.auditLog) {
        const auditObj = await getSuiObject(sharedIds.auditLog);
        if (auditObj.data) {
          const fields = (auditObj.data as any).content?.fields;
          const events = fields?.events?.fields?.contents || [];
          const historyEventsEntry = events.find(
            (entry: any) => entry.fields?.key === historyId
          );
          const rawEvents = historyEventsEntry?.fields?.value || [];
          onchainEvents = rawEvents.map((auditEvent: any, index: number) => {
            const e = auditEvent.fields || auditEvent;
            return {
              id: `onchain-${index}`,
              source: 'on-chain',
              result: 'success',
              actorRole: null,
              targetType: 'history_entry',
              targetId: null,
              accessScope: null,
              metadata: {},
              requestId: null,
              actor: e.actor || e.actor_id,
              action: e.action,
              actionLabel: getActionLabel(e.action),
              entryId: e.entry_id?.fields?.vec?.[0] ?? null,
              timestampMs: e.timestamp_ms,
            };
          });
        }
      }

      const offchainEvents = offchainRows.map((event) => ({
        id: `offchain-${event.id}`,
        source: 'off-chain',
        result: event.result,
        actorRole: event.actor_role,
        targetType: event.target_type,
        targetId: event.target_id,
        accessScope: event.access_scope,
        metadata: event.metadata,
        requestId: event.request_id,
        actor: event.actor_addr,
        action: null,
        actionLabel: event.action,
        entryId: event.entry_id,
        timestampMs: new Date(event.occurred_at).toISOString(),
      }));
      const timestampValue = (value: string | number) => {
        const text = String(value);
        return /^\d+$/.test(text) ? Number(text) : Date.parse(text);
      };
      const parsedEvents = [...onchainEvents, ...offchainEvents].sort(
        (first, second) => timestampValue(second.timestampMs) - timestampValue(first.timestampMs)
      );

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

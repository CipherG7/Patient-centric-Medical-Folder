import { Router } from 'express';
import { apiKeyAuth, requireRole } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();

router.get('/events', apiKeyAuth, requireRole('platform_admin'), async (_req, res, next) => {
  try {
    const { rows } = await getDb().query(
      `SELECT id, history_id, actor_addr, actor_role, action, entry_id,
              target_type, target_id, access_scope, result, metadata,
              request_id, occurred_at
       FROM offchain_audit_events
       ORDER BY occurred_at DESC
       LIMIT 200`
    );
    res.json({
      success: true,
      count: rows.length,
      events: rows.map((event) => ({
        id: `offchain-${event.id}`,
        historyId: event.history_id,
        source: 'off-chain',
        actor: event.actor_addr,
        actorRole: event.actor_role,
        action: event.action,
        entryId: event.entry_id,
        targetType: event.target_type,
        targetId: event.target_id,
        accessScope: event.access_scope,
        result: event.result,
        metadata: event.metadata,
        requestId: event.request_id,
        timestampMs: new Date(event.occurred_at).toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

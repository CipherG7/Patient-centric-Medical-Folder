import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { getDb } from '../db';

export interface OffchainAuditEvent {
  action: string;
  actorAddr?: string | null;
  actorRole?: string | null;
  historyId?: string | null;
  entryId?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  accessScope?: string | null;
  result?: 'success' | 'failure';
  metadata?: Record<string, string | number | boolean | null>;
  requestId?: string | null;
}

export async function recordOffchainAuditEvent(
  event: OffchainAuditEvent,
  executor: Pool | PoolClient = getDb()
): Promise<void> {
  await executor.query(
    `INSERT INTO offchain_audit_events
       (history_id, actor_addr, actor_role, action, entry_id, target_type,
        target_id, access_scope, result, metadata, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      event.historyId ?? null,
      event.actorAddr?.toLowerCase() ?? null,
      event.actorRole ?? null,
      event.action,
      event.entryId ?? null,
      event.targetType ?? null,
      event.targetId ?? null,
      event.accessScope ?? null,
      event.result ?? 'success',
      JSON.stringify(event.metadata ?? {}),
      event.requestId ?? randomUUID(),
    ]
  );
}

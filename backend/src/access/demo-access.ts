import { getDb } from '../db';

export interface DemoAccess {
  scope: 'full' | 'partial';
  entryIds: number[];
}

/**
 * Returns whether the latest presentation-mode access decision grants access.
 * This is intentionally limited to audit records marked as demo grants.
 */
export async function hasDemoAccess(
  historyId: string,
  granteeAddr: string
): Promise<boolean> {
  return (await getDemoAccess(historyId, granteeAddr)) !== null;
}

export async function getDemoAccess(
  historyId: string,
  granteeAddr: string
): Promise<DemoAccess | null> {
  const { rows } = await getDb().query(
    `SELECT action, metadata
     FROM offchain_audit_events
     WHERE history_id = $1
       AND LOWER(target_id) = LOWER($2)
       AND action IN ('access_grant_details', 'access_revocation_details')
       AND result = 'success'
     ORDER BY occurred_at DESC, id DESC
     LIMIT 1`,
    [historyId, granteeAddr]
  );

  if (rows.length === 0 || rows[0].action !== 'access_grant_details') {
    return null;
  }

  const metadata = rows[0].metadata;
  if (metadata?.demo !== true) {
    return null;
  }
  return {
    scope: metadata.scope === 'partial' ? 'partial' : 'full',
    entryIds: Array.isArray(metadata.entryIds)
      ? metadata.entryIds.map(Number).filter(Number.isInteger)
      : [],
  };
}

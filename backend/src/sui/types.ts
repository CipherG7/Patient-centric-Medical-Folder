/**
 * TypeScript types mirroring the Sui Move structs defined in the smart contracts.
 * These are used to parse and type responses from the Sui full node.
 */

// NOTE: We intentionally do NOT import `SuiObjectData` from `@mysten/sui/jsonRpc`.
// JSON-RPC types are deprecated in the Sui TS SDK in favor of `SuiGrpcClient`
// (@mysten/sui/grpc) and `SuiGraphQLClient` (@mysten/sui/graphql) — see sui.ts,
// which already reads objects via GraphQL. This local type mirrors the shape
// `getSuiObject()` actually returns, so we're not depending on a deprecated API
// just for typing.
export interface MoveObjectData {
  objectId: string;
  version?: string;
  digest?: string;
  owner?: { Shared: { initial_shared_version: string } };
  content?: {
    dataType: 'moveObject';
    fields: Record<string, unknown>;
  };
}

// ─── Move struct types ─────────────────────────────────────

/** Mirrors `medical_history::medical_history::HistoryEntry` */
export interface HistoryEntry {
  issuer: string;           // address
  entry_type: number;       // u8
  off_chain_ref: number[];  // vector<u8> containing the Walrus blob ID
  content_hash: number[];   // vector<u8> (SHA-256 digest bytes)
  timestamp_ms: string;     // u64 (Sui returns as string for JS safety)
  revoked: boolean;
}

/** Mirrors `medical_history::medical_history::MedicalHistory` */
export interface MedicalHistory {
  id: string;               // object ID
  owner: string;            // address
  entry_count: string;      // u64
}

/** Mirrors `medical_history::permission::Grant` */
export interface Grant {
  scope: number;            // u8: 0 = full, 1 = partial
  entry_ids: string[];      // vector<u64>
  expiry_ms: string;        // u64 (0 = never expires)
}

/** Mirrors `medical_history::institution_registry::Institution` */
export interface Institution {
  name: string;             // String (UTF-8)
  license_number: string;   // String
  verified: boolean;
  registered_at_ms: string; // u64
}

/** Mirrors `medical_history::audit_log::AuditEvent` */
export interface AuditEvent {
  actor: string;            // address
  action: number;           // u8
  entry_id: number[] | null; // Option<u64> — use null for none
  timestamp_ms: string;     // u64
}

// ─── Event types (emitted by Move) ─────────────────────────

export interface HistoryCreatedEvent {
  history_id: string;
  owner: string;
}

export interface EntryAddedEvent {
  history_id: string;
  entry_id: string;
  issuer: string;
  entry_type: number;
}

export interface EntryRevokedEvent {
  history_id: string;
  entry_id: string;
}

export interface InstitutionRegisteredEvent {
  institution: string;
  name: string;
}

export interface InstitutionRevokedEvent {
  institution: string;
}

export interface AccessGrantedEvent {
  history_id: string;
  grantee: string;
  scope: number;
}

export interface AccessRevokedEvent {
  history_id: string;
  grantee: string;
}

export interface EventLogged {
  history_id: string;
  actor: string;
  action: number;
}

// ─── Helper to extract field from a Sui dynamic field / object ──

/**
 * Parse an on-chain object's fields from the shape returned by `getSuiObject()`
 * in sui.ts (GraphQL-backed, not the deprecated JSON-RPC `getObject()`).
 */
export function parseMoveObject<T>(obj: MoveObjectData): T | null {
  if (!obj.content || obj.content.dataType !== 'moveObject') {
    return null;
  }
  return obj.content.fields as T;
}
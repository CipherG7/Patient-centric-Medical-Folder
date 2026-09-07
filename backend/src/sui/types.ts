/**
 * TypeScript types mirroring the Sui Move structs defined in the smart contracts.
 * These are used to parse and type responses from the Sui full node.
 */

import type { SuiObjectData } from '@mysten/sui/client';

// ─── Move struct types ─────────────────────────────────────

/** Mirrors `medical_history::medical_history::HistoryEntry` */
export interface HistoryEntry {
  issuer: string;           // address
  entry_type: number;       // u8
  off_chain_ref: number[];  // vector<u8> (e.g. IPFS CID bytes)
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
 * Parse an on-chain object's fields from its BCS-decoded content.
 * `obj` is from `SuiClient.getObject()` response.
 */
export function parseMoveObject<T>(obj: SuiObjectData): T | null {
  if (!obj.content || obj.content.dataType !== 'moveObject') {
    return null;
  }
  return (obj.content as any).fields as T;
}


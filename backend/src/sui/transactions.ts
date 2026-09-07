/**
 * Programmable Transaction Block (PTB) builders for every Move entry function.
 *
 * Each function constructs a `TransactionBlock` that can be:
 *   1. Signed by the backend keypair (demo mode — see client.ts tradeoff note)
 *   2. Serialised and sent to a frontend for client-side signing (production)
 *
 * Move package layout (from Move.toml):
 *   package: medical_history
 *   modules: medical_history, institution_registry, patient_registry,
 *            permission, audit_log
 */

import {
  Transaction,
  type TransactionArgument,
} from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { config } from '../config';

// ─── Shared object IDs ─────────────────────────────────────
// These are initialised at publish time and shared immediately.
// They must be fetched once after publish and stored in config.
//
// For a cleaner approach, the backend could discover them via
// `suiClient.getObject()` using known fixed IDs, but for this demo
// they are expected in environment variables or derived from the
// first published package.

export interface SharedObjectIds {
  institutionRegistry: string;
  patientRegistry: string;
  permissionStore: string;
  auditLog: string;
}

// ─── Helpers ────────────────────────────────────────────────

const PACKAGE_ID = () => config.PACKAGE_ID;

// ─── Institution Registry ──────────────────────────────────

/**
 * Register a new verified institution.
 * Calls `institution_registry::register_institution`.
 *
 * Requires: AdminCap object owned by the signer (admin).
 */
export function buildRegisterInstitutionPTB(
  sharedObjects: SharedObjectIds,
  adminCapId: string,
  institutionAddr: string,
  name: string,
  licenseNumber: string,
  registeredAtMs: number
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::institution_registry::register_institution`,
    arguments: [
      tx.object(adminCapId),
      tx.object(sharedObjects.institutionRegistry),
      tx.pure.address(institutionAddr),
      tx.pure.string(name),
      tx.pure.string(licenseNumber),
      tx.pure.u64(registeredAtMs),
    ],
  });

  return tx;
}

/**
 * Revoke an institution's verified status.
 */
export function buildRevokeInstitutionPTB(
  sharedObjects: SharedObjectIds,
  adminCapId: string,
  institutionAddr: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::institution_registry::revoke_institution`,
    arguments: [
      tx.object(adminCapId),
      tx.object(sharedObjects.institutionRegistry),
      tx.pure.address(institutionAddr),
    ],
  });

  return tx;
}

/**
 * Reinstate a previously revoked institution.
 */
export function buildReinstateInstitutionPTB(
  sharedObjects: SharedObjectIds,
  adminCapId: string,
  institutionAddr: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::institution_registry::reinstate_institution`,
    arguments: [
      tx.object(adminCapId),
      tx.object(sharedObjects.institutionRegistry),
      tx.pure.address(institutionAddr),
    ],
  });

  return tx;
}

// ─── Patient Registry ──────────────────────────────────────

/**
 * Create a new medical history for the calling patient.
 * Calls `medical_history::create_history`.
 */
export function buildCreateHistoryPTB(
  sharedObjects: SharedObjectIds
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::create_history`,
    arguments: [
      tx.object(sharedObjects.patientRegistry),
    ],
  });

  return tx;
}

// ─── Medical History (Entries) ─────────────────────────────

/**
 * Append a new entry to a medical history.
 * Only a verified institution can call this.
 * Calls `medical_history::add_entry`.
 */
export function buildAddEntryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  entryType: number,
  offChainRef: number[] | string,
  contentHash: number[] | string
): Transaction {
  const tx = new Transaction();

  // Convert hex/IPFS strings to byte vectors if needed
  const offChainBytes = typeof offChainRef === 'string'
    ? tx.pure(bcs.vector(bcs.u8()).serialize(new TextEncoder().encode(offChainRef)))
    : tx.pure(bcs.vector(bcs.u8()).serialize(new Uint8Array(offChainRef)));

  const hashBytes = typeof contentHash === 'string'
    ? tx.pure(bcs.vector(bcs.u8()).serialize(new TextEncoder().encode(contentHash)))
    : tx.pure(bcs.vector(bcs.u8()).serialize(new Uint8Array(contentHash)));

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::add_entry`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.institutionRegistry),
      tx.object(sharedObjects.auditLog),
      tx.pure.u8(entryType),
      offChainBytes,
      hashBytes,
      tx.object('0x6'), // sui::clock::Clock (shared object at 0x6)
    ],
  });

  return tx;
}

/**
 * Revoke (flag) an entry as invalid. Owner-only.
 * Calls `medical_history::revoke_entry`.
 */
export function buildRevokeEntryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  entryId: number
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::revoke_entry`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.auditLog),
      tx.pure.u64(entryId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

// ─── Consent / Access Control ──────────────────────────────

/**
 * Grant full access to a grantee.
 * Calls `medical_history::grant_full_access`.
 */
export function buildGrantFullAccessPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  granteeAddr: string,
  expiryMs: number
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::grant_full_access`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.permissionStore),
      tx.object(sharedObjects.auditLog),
      tx.pure.address(granteeAddr),
      tx.pure.u64(expiryMs),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Grant partial access (specific entry IDs) to a grantee.
 * Calls `medical_history::grant_partial_access`.
 */
export function buildGrantPartialAccessPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  granteeAddr: string,
  entryIds: number[],
  expiryMs: number
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::grant_partial_access`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.permissionStore),
      tx.object(sharedObjects.auditLog),
      tx.pure.address(granteeAddr),
      tx.pure(bcs.vector(bcs.u64()).serialize(new Uint8Array(entryIds))),
      tx.pure.u64(expiryMs),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Revoke any access grant for a grantee.
 * Calls `medical_history::revoke_access`.
 */
export function buildRevokeAccessPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  granteeAddr: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::revoke_access`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.permissionStore),
      tx.object(sharedObjects.auditLog),
      tx.pure.address(granteeAddr),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

// ─── Read Functions (Move calls that return values) ────────

/**
 * Read the full medical history (all entries).
 * Calls `medical_history::read_full_history`.
 * Returns the vector<HistoryEntry> as emitted by the Move call.
 */
export function buildReadFullHistoryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  viewerAddr: string
): Transaction {
  const tx = new Transaction();

  const [result] = tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::read_full_history`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.permissionStore),
      tx.object(sharedObjects.auditLog),
      tx.object('0x6'), // Clock
    ],
  });

  // Make the result available in the effects/events
  return tx;
}

/**
 * Read a single entry from a history.
 * Calls `medical_history::read_entry`.
 * Returns the HistoryEntry.
 */
export function buildReadEntryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  entryId: number
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::read_entry`,
    arguments: [
      tx.object(historyId),
      tx.object(sharedObjects.permissionStore),
      tx.object(sharedObjects.auditLog),
      tx.pure.u64(entryId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

// ─── Audit Log ──────────────────────────────────────────────

/**
 * Fetch the full audit log for a history.
 * Calls `audit_log::events_for`.
 * This is a read-only call and doesn't require a transaction — use
 * `suiClient.getObject()` or `devInspectTransactionBlock` instead.
 */
export function buildFetchAuditLogPTB(
  sharedObjects: SharedObjectIds,
  historyId: string
): Transaction {
  const tx = new Transaction();

  const [events] = tx.moveCall({
    target: `${PACKAGE_ID()}::audit_log::events_for`,
    arguments: [
      tx.object(sharedObjects.auditLog),
      tx.pure.address(historyId), // history_id is an ID (address type)
    ],
  });

  tx.transferObjects([events], tx.pure.address(config.ADMIN_PRIVATE_KEY ? '0x0' : '0x0'));

  return tx;
}

// ─── Utility: Execute and parse ────────────────────────────

/**
 * Execute a transaction signed by the admin keypair.
 * Returns the digest and parsed effects.
 */
export async function executeTx(
  suiClient: SuiClient,
  tx: Transaction,
  signerKeypair: any
): Promise<{ digest: string; effects: any }> {
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: signerKeypair,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });

  return {
    digest: result.digest,
    effects: result.effects,
  };
}

/**
 * Dry-run a transaction (useful for read calls that return values).
 */
export async function dryRunTx(
  suiClient: SuiClient,
  tx: Transaction,
  senderAddress: string
): Promise<any> {
  const result = await suiClient.devInspectTransactionBlock({
    sender: senderAddress,
    transactionBlock: tx,
  });

  return result;
}


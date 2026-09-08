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
  Inputs,
  type TransactionArgument,
} from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
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

export interface SharedObjectRef {
  objectId: string;
  initialSharedVersion: string | number;
  mutable: boolean;
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
  contentHash: number[] | string,
  sharedObjectRefs?: {
    history?: SharedObjectRef;
    institutionRegistry?: SharedObjectRef;
    auditLog?: SharedObjectRef;
    clock?: SharedObjectRef;
  }
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
      sharedObjectRefs?.history
        ? tx.sharedObjectRef(sharedObjectRefs.history)
        : tx.object(historyId),
      sharedObjectRefs?.institutionRegistry
        ? tx.sharedObjectRef(sharedObjectRefs.institutionRegistry)
        : tx.object(sharedObjects.institutionRegistry),
      sharedObjectRefs?.auditLog
        ? tx.sharedObjectRef(sharedObjectRefs.auditLog)
        : tx.object(sharedObjects.auditLog),
      tx.pure.u8(entryType),
      offChainBytes,
      hashBytes,
      sharedObjectRefs?.clock
        ? tx.sharedObjectRef(sharedObjectRefs.clock)
        : tx.object('0x6'),
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
): Promise<{ digest: string; effects: any; events: any; objects: any }> {
  tx.setSenderIfNotSet(signerKeypair.toSuiAddress());
  const grpcClient = new SuiGrpcClient({
    baseUrl: config.SUI_GRPC_URL,
    network: config.SUI_NETWORK as any,
  });
  (grpcClient.core as any).resolveTransactionPlugin = () => async (
    transactionData: any,
    _options: unknown,
    next: () => Promise<void>
  ) => {
    for (let index = 0; index < transactionData.inputs.length; index += 1) {
      const input = transactionData.inputs[index];
      if (!input.UnresolvedObject) continue;

      const objectResponse = await fetch(config.SUI_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `
            query ResolveObject($address: SuiAddress!) {
              object(address: $address) {
                address
                version
                digest
                owner {
                  __typename
                  ... on Shared {
                    initialSharedVersion
                  }
                }
              }
            }
          `,
          variables: { address: input.UnresolvedObject.objectId },
        }),
      });
      if (!objectResponse.ok) {
        throw new Error(`Sui GraphQL object resolution failed: ${objectResponse.status}`);
      }
      const payload = await objectResponse.json() as {
        data?: {
          object?: {
            address: string;
            version: string;
            digest: string;
            owner?: {
              __typename?: string;
              initialSharedVersion?: string;
            } | null;
          } | null;
        };
        errors?: Array<{ message?: string }>;
      };
      if (payload.errors?.length) {
        throw new Error(payload.errors.map((error) => error.message || 'GraphQL error').join('; '));
      }
      const object = payload.data?.object;
      if (!object) {
        throw new Error(`Sui object not found: ${input.UnresolvedObject.objectId}`);
      }
      if (
        object.owner?.__typename === 'Shared' &&
        object.owner.initialSharedVersion
      ) {
        transactionData.inputs[index] = Inputs.SharedObjectRef({
          objectId: object.address,
          initialSharedVersion: object.owner.initialSharedVersion,
          mutable: input.UnresolvedObject.mutable ?? false,
        });
      } else {
        transactionData.inputs[index] = Inputs.ObjectRef({
          objectId: object.address,
          version: object.version,
          digest: object.digest,
        });
      }
    }
    await next();
  };
  const sender = signerKeypair.toSuiAddress();
  const { objects: gasCoins } = await grpcClient.core.getCoins({
    address: sender,
    coinType: '0x2::sui::SUI',
    limit: 1,
  });
  const gasCoin = gasCoins[0];
  if (!gasCoin) {
    throw new Error(`No SUI gas coin available for transaction sender ${sender}`);
  }
  tx.setGasPayment([{
    objectId: gasCoin.id,
    version: gasCoin.version,
    digest: gasCoin.digest,
  }]);
  tx.setGasBudgetIfNotSet(100_000_000);
  tx.setGasPrice(BigInt((await grpcClient.core.getReferenceGasPrice()).referenceGasPrice));
  const bytes = await tx.build({ client: grpcClient });
  const { signature } = await signerKeypair.signTransaction(bytes);
  const { response } = await grpcClient.transactionExecutionService.executeTransaction({
    transaction: {
      bcs: { value: bytes },
    },
    signatures: [{
      bcs: { value: Buffer.from(signature, 'base64') },
      signature: { oneofKind: undefined },
    }],
    readMask: {
      paths: [
        'digest',
        'effects',
        'events',
        'signatures',
        'objects',
      ],
    },
  });

  return {
    digest: response.transaction?.digest || '',
    effects: response.transaction?.effects || {},
    events: response.transaction?.events || {},
    objects: response.transaction?.objects || {},
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

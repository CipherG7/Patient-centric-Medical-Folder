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
 *
 * IMPORTANT — shared object mutability:
 * Sui requires every PTB argument that references a *shared* object to declare
 * up front whether it will be used mutably (`&mut T`) or read-only (`&T`).
 * Because this backend drives transaction building/signing/execution through a
 * custom gRPC + GraphQL pipeline (not the standard SuiClient), the SDK's normal
 * automatic mutability inference (via Move ABI introspection) does not run.
 * So every shared object argument below is resolved explicitly via
 * `fetchSharedObjectRef(objectId, mutable)` with a hardcoded mutability flag.
 *
 * `create_history`'s `mutable: true` requirement on PatientRegistry is
 * CONFIRMED (testnet abort: `CommandArgumentError { kind: InvalidObjectByMutRef }`
 * when passed immutable). The other flags below are best-effort based on what
 * each function almost certainly needs to do (write a registry entry, write an
 * audit log row, etc.) — if you hit the same `InvalidObjectByMutRef` error on
 * a different call, flip that argument's `mutable` flag and it should resolve.
 */

import {
  Transaction,
  Inputs,
  type TransactionArgument,
} from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { bcs } from '@mysten/sui/bcs';
import { config } from '../config';

// ─── Shared object IDs ─────────────────────────────────────
// These are initialised at publish time and shared immediately.
// They must be fetched once after publish and stored in config.

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
const SUI_COIN_TYPE = '0x2::sui::SUI';
const GAS_BUDGET = 50_000_000;

/**
 * Resolve a shared object's current `initialSharedVersion` via GraphQL and
 * return a fully-specified `SharedObjectRef` with an explicit mutability flag.
 * Use this for any shared object argument instead of `tx.object(id)`, since
 * plain `tx.object()` leaves mutability to be auto-inferred — which doesn't
 * happen reliably in this backend's custom execution pipeline.
 */
async function fetchSharedObjectRef(
  objectId: string,
  mutable: boolean
): Promise<SharedObjectRef> {
  const response = await fetch(config.SUI_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `
        query ResolveSharedObject($address: SuiAddress!) {
          object(address: $address) {
            address
            owner {
              __typename
              ... on Shared {
                initialSharedVersion
              }
            }
          }
        }
      `,
      variables: { address: objectId },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Sui GraphQL object resolution failed for ${objectId}: ${response.status}`
    );
  }

  const payload = (await response.json()) as {
    data?: {
      object?: {
        address: string;
        owner?: { __typename?: string; initialSharedVersion?: string } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((error) => error.message || 'GraphQL error').join('; ')
    );
  }

  const object = payload.data?.object;
  if (!object) {
    throw new Error(`Sui object not found: ${objectId}`);
  }
  if (object.owner?.__typename !== 'Shared' || !object.owner.initialSharedVersion) {
    throw new Error(
      `Object ${objectId} is not a shared object (or has no initialSharedVersion)`
    );
  }

  return {
    objectId: object.address,
    initialSharedVersion: object.owner.initialSharedVersion,
    mutable,
  };
}

// ─── Institution Registry ──────────────────────────────────

/**
 * Register a new verified institution.
 * Calls `institution_registry::register_institution`.
 *
 * Requires: AdminCap object owned by the signer (admin).
 */
export async function buildRegisterInstitutionPTB(
  sharedObjects: SharedObjectIds,
  adminCapId: string,
  institutionAddr: string,
  name: string,
  licenseNumber: string,
  registeredAtMs: number
): Promise<Transaction> {
  const tx = new Transaction();

  const registryRef = await fetchSharedObjectRef(sharedObjects.institutionRegistry, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::institution_registry::register_institution`,
    arguments: [
      tx.object(adminCapId),
      tx.sharedObjectRef(registryRef),
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
export async function buildRevokeInstitutionPTB(
  sharedObjects: SharedObjectIds,
  adminCapId: string,
  institutionAddr: string
): Promise<Transaction> {
  const tx = new Transaction();

  const registryRef = await fetchSharedObjectRef(sharedObjects.institutionRegistry, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::institution_registry::revoke_institution`,
    arguments: [
      tx.object(adminCapId),
      tx.sharedObjectRef(registryRef),
      tx.pure.address(institutionAddr),
    ],
  });

  return tx;
}

/**
 * Reinstate a previously revoked institution.
 */
export async function buildReinstateInstitutionPTB(
  sharedObjects: SharedObjectIds,
  adminCapId: string,
  institutionAddr: string
): Promise<Transaction> {
  const tx = new Transaction();

  const registryRef = await fetchSharedObjectRef(sharedObjects.institutionRegistry, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::institution_registry::reinstate_institution`,
    arguments: [
      tx.object(adminCapId),
      tx.sharedObjectRef(registryRef),
      tx.pure.address(institutionAddr),
    ],
  });

  return tx;
}

// ─── Patient Registry ──────────────────────────────────────

/**
 * Create a new medical history for `patientAddr`.
 * Calls `medical_history::create_history_for`.
 *
 * Uses the admin-mediated path (not `create_history`) because this backend
 * signs on behalf of patients rather than patients signing themselves —
 * `create_history` derives identity from ctx::sender(), which would always
 * resolve to the admin address here. See create_history_for's doc comment
 * in medical_history.move for the tradeoff.
 *
 * CALLERS MUST CHECK FIRST whether the patient already has a history (via
 * `checkExistingHistory` below) before calling this — it aborts with
 * `EAlreadyRegistered` (abort code 0) if `patientAddr` is already
 * registered in PatientRegistry.
 *
 * CONFIRMED via testnet: this call aborts with
 * `CommandArgumentError { kind: InvalidObjectByMutRef }` unless PatientRegistry
 * is passed as a *mutable* shared object reference.
 */
export async function buildCreateHistoryPTB(
  sharedObjects: SharedObjectIds,
  patientAddr: string
): Promise<Transaction> {
  const tx = new Transaction();

  const registryRef = await fetchSharedObjectRef(sharedObjects.patientRegistry, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::create_history_for`,
    arguments: [tx.sharedObjectRef(registryRef), tx.pure.address(patientAddr)],
  });

  return tx;
}

// ─── Medical History (Entries) ─────────────────────────────

/**
 * Append a new entry to a medical history.
 * Only a verified institution can call this.
 * Calls `medical_history::add_entry`.
 */
export async function buildAddEntryPTB(
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
): Promise<Transaction> {
  const tx = new Transaction();

  const offChainBytes = typeof offChainRef === 'string'
    ? tx.pure(bcs.vector(bcs.u8()).serialize(new TextEncoder().encode(offChainRef)))
    : tx.pure(bcs.vector(bcs.u8()).serialize(new Uint8Array(offChainRef)));

  const hashBytes = typeof contentHash === 'string'
    ? tx.pure(bcs.vector(bcs.u8()).serialize(new TextEncoder().encode(contentHash)))
    : tx.pure(bcs.vector(bcs.u8()).serialize(new Uint8Array(contentHash)));

  const historyRef =
    sharedObjectRefs?.history ?? (await fetchSharedObjectRef(historyId, true));

  const institutionRegistryRef =
    sharedObjectRefs?.institutionRegistry ??
    (await fetchSharedObjectRef(sharedObjects.institutionRegistry, false));

  const auditLogRef =
    sharedObjectRefs?.auditLog ?? (await fetchSharedObjectRef(sharedObjects.auditLog, true));

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::add_entry`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(institutionRegistryRef),
      tx.sharedObjectRef(auditLogRef),
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
export async function buildRevokeEntryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  entryId: number
): Promise<Transaction> {
  const tx = new Transaction();

  const historyRef = await fetchSharedObjectRef(historyId, true);
  const auditLogRef = await fetchSharedObjectRef(sharedObjects.auditLog, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::revoke_entry`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(auditLogRef),
      tx.pure.u64(entryId),
      tx.object('0x6'),
    ],
  });

  return tx;
}

// ─── Consent / Access Control ──────────────────────────────

/**
 * Grant full access to a grantee.
 * Calls `medical_history::grant_full_access`.
 */
export async function buildGrantFullAccessPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  granteeAddr: string,
  expiryMs: number
): Promise<Transaction> {
  const tx = new Transaction();

  const historyRef = await fetchSharedObjectRef(historyId, false);
  const permissionStoreRef = await fetchSharedObjectRef(sharedObjects.permissionStore, true);
  const auditLogRef = await fetchSharedObjectRef(sharedObjects.auditLog, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::grant_full_access`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(permissionStoreRef),
      tx.sharedObjectRef(auditLogRef),
      tx.pure.address(granteeAddr),
      tx.pure.u64(expiryMs),
      tx.object('0x6'),
    ],
  });

  return tx;
}

/**
 * Grant partial access (specific entry IDs) to a grantee.
 * Calls `medical_history::grant_partial_access`.
 */
export async function buildGrantPartialAccessPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  granteeAddr: string,
  entryIds: number[],
  expiryMs: number
): Promise<Transaction> {
  const tx = new Transaction();

  const historyRef = await fetchSharedObjectRef(historyId, false);
  const permissionStoreRef = await fetchSharedObjectRef(sharedObjects.permissionStore, true);
  const auditLogRef = await fetchSharedObjectRef(sharedObjects.auditLog, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::grant_partial_access`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(permissionStoreRef),
      tx.sharedObjectRef(auditLogRef),
      tx.pure.address(granteeAddr),
      tx.pure(bcs.vector(bcs.u64()).serialize(new Uint8Array(entryIds))),
      tx.pure.u64(expiryMs),
      tx.object('0x6'),
    ],
  });

  return tx;
}

/**
 * Revoke any access grant for a grantee.
 * Calls `medical_history::revoke_access`.
 */
export async function buildRevokeAccessPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  granteeAddr: string
): Promise<Transaction> {
  const tx = new Transaction();

  const historyRef = await fetchSharedObjectRef(historyId, false);
  const permissionStoreRef = await fetchSharedObjectRef(sharedObjects.permissionStore, true);
  const auditLogRef = await fetchSharedObjectRef(sharedObjects.auditLog, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::revoke_access`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(permissionStoreRef),
      tx.sharedObjectRef(auditLogRef),
      tx.pure.address(granteeAddr),
      tx.object('0x6'),
    ],
  });

  return tx;
}

// ─── Read Functions (Move calls that return values) ────────

/**
 * Read the full medical history (all entries).
 * Calls `medical_history::read_full_history`.
 */
export async function buildReadFullHistoryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  viewerAddr: string
): Promise<Transaction> {
  const tx = new Transaction();

  const historyRef = await fetchSharedObjectRef(historyId, false);
  const permissionStoreRef = await fetchSharedObjectRef(sharedObjects.permissionStore, false);
  const auditLogRef = await fetchSharedObjectRef(sharedObjects.auditLog, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::read_full_history`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(permissionStoreRef),
      tx.sharedObjectRef(auditLogRef),
      tx.object('0x6'),
    ],
  });

  return tx;
}

/**
 * Read a single entry from a history.
 * Calls `medical_history::read_entry`.
 */
export async function buildReadEntryPTB(
  sharedObjects: SharedObjectIds,
  historyId: string,
  entryId: number
): Promise<Transaction> {
  const tx = new Transaction();

  const historyRef = await fetchSharedObjectRef(historyId, false);
  const permissionStoreRef = await fetchSharedObjectRef(sharedObjects.permissionStore, false);
  const auditLogRef = await fetchSharedObjectRef(sharedObjects.auditLog, true);

  tx.moveCall({
    target: `${PACKAGE_ID()}::medical_history::read_entry`,
    arguments: [
      tx.sharedObjectRef(historyRef),
      tx.sharedObjectRef(permissionStoreRef),
      tx.sharedObjectRef(auditLogRef),
      tx.pure.u64(entryId),
      tx.object('0x6'),
    ],
  });

  return tx;
}

// ─── Audit Log ──────────────────────────────────────────────

/**
 * Fetch the full audit log for a history.
 * Calls `audit_log::events_for`.
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
      tx.pure.address(historyId),
    ],
  });

  tx.transferObjects([events], tx.pure.address(config.ADMIN_PRIVATE_KEY ? '0x0' : '0x0'));

  return tx;
}

// ─── Utility: resolve reference gas price ──────────────────

/**
 * Fetch the current epoch's reference gas price via GraphQL.
 *
 * NOTE: This exists because `executeTx` below installs a custom
 * `resolveTransactionPlugin` on the gRPC client (to resolve UnresolvedObject
 * inputs via GraphQL). That override completely replaces the SDK's default
 * `coreClientResolveTransactionPlugin`, which is normally what calls
 * `client.core.getCurrentSystemState()` and sets `gasData.price` from
 * `systemState.referenceGasPrice`. Since our override doesn't do that, we
 * have to resolve and set the gas price ourselves before building/signing —
 * otherwise `Transaction.build()` throws `Missing gas price`.
 */
async function getReferenceGasPrice(): Promise<string> {
  const response = await fetch(config.SUI_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query { epoch { referenceGasPrice } }`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sui GraphQL gas price request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: { epoch?: { referenceGasPrice?: string } };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((error) => error.message || 'GraphQL error').join('; ')
    );
  }

  const referenceGasPrice = payload.data?.epoch?.referenceGasPrice;
  if (!referenceGasPrice) {
    throw new Error('Could not resolve reference gas price from GraphQL');
  }
  return referenceGasPrice;
}

// ─── Utility: select gas coins for payment ─────────────────

/**
 * Fetch and select owned SUI coin objects to cover `budget` for `owner`.
 *
 * NOTE: `tx.setGasPayment([])` does NOT mean "let the node pick gas coins".
 * In this SDK/node version it instructs the node to withdraw gas from the
 * address's on-chain "withdrawable balance" — a separate mechanism from
 * owned Coin objects — which is typically 0 even for a funded address. The
 * node's own error message confirms this: "the transaction requires
 * 50000000 but only 0 is available... use the Coin objects directly as
 * transaction inputs." So we must fetch actual owned Coin objects and pass
 * them explicitly via `tx.setGasPayment(...)`.
 */
async function selectGasCoins(
  grpcClient: SuiGrpcClient,
  owner: string,
  budget: number
): Promise<{ objectId: string; version: string; digest: string }[]> {
  const { objects: gasCoins } = await grpcClient.core.listCoins({
    owner,
    coinType: SUI_COIN_TYPE,
  });

  if (gasCoins.length === 0) {
    throw new Error(
      `Admin address ${owner} has no SUI coin objects. Fund it via faucet before signing transactions.`
    );
  }

  let accumulated = 0n;
  const selected: { objectId: string; version: string; digest: string }[] = [];
  for (const coin of gasCoins) {
    selected.push({ objectId: coin.objectId, version: coin.version, digest: coin.digest });
    accumulated += BigInt(coin.balance);
    if (accumulated >= BigInt(budget)) break;
  }

  if (accumulated < BigInt(budget)) {
    throw new Error(
      `Admin address ${owner} has insufficient SUI balance for gas: needs ${budget}, has ${accumulated}.`
    );
  }

  return selected;
}

// ─── Utility: read-only simulation (no gas spent, no submission) ──

/**
 * Simulate (dry-run) a single-command Move call via `grpcClient.core.simulateTransaction`
 * and return the raw BCS bytes of its return value. No transaction is submitted
 * and no gas is actually spent — this is purely a read.
 *
 * `build` receives the in-progress `Transaction` so the caller can attach
 * exactly one `tx.moveCall(...)` (or any read-only command sequence) to it.
 */
async function simulateReadCall(
  grpcClient: SuiGrpcClient,
  sender: string,
  build: (tx: Transaction) => void
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(GAS_BUDGET);

  const gasCoins = await selectGasCoins(grpcClient, sender, GAS_BUDGET);
  tx.setGasPayment(gasCoins);

  const referenceGasPrice = await getReferenceGasPrice();
  tx.setGasPrice(referenceGasPrice);

  build(tx);

  const builtBytes = await tx.build({ client: grpcClient });

  const result = await grpcClient.core.simulateTransaction({
    transaction: builtBytes,
    include: { commandResults: true },
  } as any);

  if (result.$kind === 'FailedTransaction') {
    const status = (result.FailedTransaction as any)?.status;
    throw new Error(
      `Simulation failed: ${status?.error?.message ?? JSON.stringify(status)}`
    );
  }

  const commandResults = (result as any).commandResults;
  const returnBytes = commandResults?.[0]?.returnValues?.[0]?.bcs;
  if (!returnBytes) {
    throw new Error('Simulation returned no value');
  }
  return returnBytes as Uint8Array;
}

/**
 * Check whether `patientAddr` already has a registered `MedicalHistory`, via
 * read-only simulation of `patient_registry::has_history` and (if true)
 * `history_id_of` — no gas spent, no transaction submitted.
 *
 * Needed because:
 *   1. `create_history_for` aborts with `EAlreadyRegistered` if called for
 *      an address that already has a history — callers must check first.
 *   2. The naive approach of reading `PatientRegistry`'s JSON content and
 *      walking `histories.fields.contents` never worked: `Table<K, V>`
 *      entries live in dynamic fields on the table's own object, not
 *      inlined in the parent object's JSON, regardless of JSON-RPC vs
 *      GraphQL. Simulating the actual Move view functions sidesteps that
 *      entirely.
 */
export async function checkExistingHistory(
  sharedObjects: SharedObjectIds,
  patientAddr: string,
  signerAddr: string
): Promise<{ exists: boolean; historyId?: string }> {
  const grpcClient = new SuiGrpcClient({
    baseUrl: config.SUI_GRPC_URL,
    network: config.SUI_NETWORK as any,
  });

  const registryRef = await fetchSharedObjectRef(sharedObjects.patientRegistry, false);

  const hasHistoryBytes = await simulateReadCall(grpcClient, signerAddr, (tx) => {
    tx.moveCall({
      target: `${PACKAGE_ID()}::patient_registry::has_history`,
      arguments: [tx.sharedObjectRef(registryRef), tx.pure.address(patientAddr)],
    });
  });
  const exists = bcs.bool().parse(hasHistoryBytes);

  if (!exists) {
    return { exists: false };
  }

  const historyIdBytes = await simulateReadCall(grpcClient, signerAddr, (tx) => {
    tx.moveCall({
      target: `${PACKAGE_ID()}::patient_registry::history_id_of`,
      arguments: [tx.sharedObjectRef(registryRef), tx.pure.address(patientAddr)],
    });
  });
  // `ID` is a single-field struct wrapping an address, which BCS-encodes
  // identically to a raw address (structs have no framing overhead).
  const historyId = bcs.Address.parse(historyIdBytes);

  return { exists: true, historyId };
}

// ─── Utility: Execute and parse ────────────────────────────

/**
 * Execute a transaction signed by the admin keypair.
 *
 * FIX SUMMARY (vs original):
 * 1. Replaced raw `grpcClient.transactionExecutionService.executeTransaction()`
 *    (proto client) with the SDK's `grpcClient.signAndExecuteTransaction()`.
 *    The raw proto client returns a different response shape and `readMask: ['*']`
 *    is not valid in protobuf FieldMask — it caused all fields to be empty.
 * 2. Added `include: { effects: true, events: true, objectTypes: true }` so the
 *    SDK correctly requests these fields from the node.
 * 3. Added `waitForTransaction` so the indexer has caught up before the caller
 *    reads back any state.
 * 4. Returns `events` as a plain array (SDK shape) instead of a proto object.
 * 5. Explicitly resolves and sets the gas price via GraphQL before building,
 *    since the custom `resolveTransactionPlugin` override below replaces the
 *    SDK's default plugin (which would otherwise have set it automatically).
 * 6. Replaced `tx.setGasPayment([])` (address-balance withdrawal, which this
 *    admin address doesn't have) with explicit owned Coin objects fetched via
 *    `listCoins`, per the "Insufficient address balance... use the Coin
 *    objects directly" node error.
 */
export async function executeTx(
  _suiClient: unknown,
  tx: Transaction,
  signerKeypair: any
): Promise<{ digest: string; effects: any; events: any[]; objects: any }> {
  const grpcClient = new SuiGrpcClient({
    baseUrl: config.SUI_GRPC_URL,
    network: config.SUI_NETWORK as any,
  });

  const sender = signerKeypair.toSuiAddress();
  tx.setSenderIfNotSet(sender);
  tx.setGasBudget(GAS_BUDGET);

  // Fetch and set actual owned SUI coin objects as gas payment — see
  // selectGasCoins() for why `tx.setGasPayment([])` doesn't work here.
  const gasCoins = await selectGasCoins(grpcClient, sender, GAS_BUDGET);
  tx.setGasPayment(gasCoins);

  // Our custom resolveTransactionPlugin override (below) completely replaces
  // the SDK's default plugin, which would normally also resolve the gas price
  // via client.core.getCurrentSystemState(). Since that path is bypassed here,
  // resolve and set it explicitly via GraphQL.
  const referenceGasPrice = await getReferenceGasPrice();
  tx.setGasPrice(referenceGasPrice);

  // ── Object resolution plugin ──────────────────────────────
  // Resolves any remaining UnresolvedObject inputs (e.g. Clock at 0x6,
  // owned AdminCap objects) that were not pre-resolved by fetchSharedObjectRef.
  // Shared objects that need mutable: true are resolved upstream before
  // reaching this plugin, so the fallback default of mutable: false is safe.
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
        throw new Error(
          payload.errors.map((error) => error.message || 'GraphQL error').join('; ')
        );
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

    // ── Execute via SDK (not raw proto client) ────────────────
  // The SDK's executeTransaction correctly encodes the readMask,
  // handles BCS serialisation, and returns a typed discriminated union.
  const result = await grpcClient.signAndExecuteTransaction({
    transaction: tx,
    signer: signerKeypair,
    include: {
      effects: true,      // ← created/mutated/deleted objects, gas used
      events: true,       // ← Move events including HistoryCreated
      objectTypes: true,  // ← type info for changed objects (fallback lookup)
      balanceChanges: true,
    },
  });

  // ── Check for on-chain failure ────────────────────────────
  // executeTransaction returns a discriminated union — a resolved
  // promise does NOT mean the transaction succeeded on-chain.
  if (result.$kind === 'FailedTransaction') {
    throw new Error(
      `Transaction failed on-chain: ${
        result.FailedTransaction.status.error?.message ?? JSON.stringify(result.FailedTransaction.status)
      }`
    );
  }

  const transaction = result.Transaction;

  // ── Wait for indexer ──────────────────────────────────────
  // Read APIs (getBalance, getObject, etc.) are served from indexed state
  // which trails execution. Wait before the caller reads anything back.
  await grpcClient.waitForTransaction({ digest: transaction.digest });

  // ── Debug logging (remove once confirmed working) ─────────
  console.log('[executeTx] digest:', transaction.digest);
  console.log('[executeTx] events:', JSON.stringify(transaction.events, null, 2));
  console.log(
    '[executeTx] changedObjects:',
    JSON.stringify(transaction.effects?.changedObjects, null, 2)
  );

  // ── Return in the shape patient.ts expects ────────────────
  // events is now a plain array — not a proto wrapper object.
  return {
    digest: transaction.digest,
    effects: transaction.effects ?? {},
    events: transaction.events ?? [],   // plain array of { eventType, json, ... }
    objects: {},
  };
}
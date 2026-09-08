/**
 * Utility functions for interacting with the Sui blockchain.
 * Helps parse returned data, look up shared objects, and manage
 * common operations.
 */

import type { SuiClient, SuiObjectData, SuiObjectResponse } from '@mysten/sui/client';
import { config } from '../config';
import { getSuiClient } from '../sui/client';
import type { SharedObjectIds, SharedObjectRef } from '../sui/transactions';

/**
 * Map of known Sui framework shared object IDs.
 */
export const KNOWN_SHARED_OBJECTS = {
  Clock: '0x0000000000000000000000000000000000000000000000000000000000000006',
} as const;

/**
 * After publishing the package, the admin needs to provide the
 * shared object IDs for the four singleton objects that were
 * created at publish time:
 *   - InstitutionRegistry
 *   - PatientRegistry
 *   - PermissionStore
 *   - AuditLog
 *
 * In a real deployment these would be discovered by querying the
 * package's created objects. For the demo, they come from env or
 * a config file.
 *
 * This function provides a placeholder structure.
 */
export function getSharedObjectIds(): SharedObjectIds {
  // In production, these would be fetched from a config service or
  // discovered by scanning the output of `sui client publish`.
  return {
    institutionRegistry:
      process.env.SHARED_INSTITUTION_REGISTRY || '',
    patientRegistry:
      process.env.SHARED_PATIENT_REGISTRY || '',
    permissionStore:
      process.env.SHARED_PERMISSION_STORE || '',
    auditLog:
      process.env.SHARED_AUDIT_LOG || '',
  };
}

/**
 * Resolve a shared object's initial version before adding it to a PTB.
 */
export async function getSharedObjectRef(
  client: SuiClient,
  objectId: string,
  name: string,
  mutable: boolean
): Promise<SharedObjectRef> {
  const response = await client.getObject({
    id: objectId,
    options: { showOwner: true },
  });
  const owner = response.data?.owner;

  if (!owner || typeof owner !== 'object' || !('Shared' in owner)) {
    throw new Error(
      `${name} (${objectId}) is not a shared object. ` +
        'Check the SHARED_* environment variable and use the ID from the package publish output.'
    );
  }

  return {
    objectId,
    initialSharedVersion: owner.Shared.initial_shared_version,
    mutable,
  };
}

/**
 * Fetch a Sui object and return its parsed content.
 */
export async function getObjectFields(
  client: SuiClient,
  objectId: string
): Promise<any> {
  const response = await client.getObject({
    id: objectId,
    options: {
      showContent: true,
      showOwner: true,
      showType: true,
    },
  });

  if (!response.data) {
    throw new Error(`Object not found: ${objectId}`);
  }

  const data = response.data as SuiObjectData;
  if (data.content?.dataType !== 'moveObject') {
    throw new Error(`Object is not a Move object: ${objectId}`);
  }

  return data.content.fields;
}

/**
 * Parse the `InstitutionRegistry` shared object to get all registered
 * institutions and their statuses.
 */
export async function getInstitutionRegistry(client: SuiClient): Promise<any> {
  const sharedIds = getSharedObjectIds();
  if (!sharedIds.institutionRegistry) {
    throw new Error('InstitutionRegistry shared object ID not configured');
  }
  return getObjectFields(client, sharedIds.institutionRegistry);
}

/**
 * Parse the `PatientRegistry` shared object.
 */
export async function getPatientRegistry(client: SuiClient): Promise<any> {
  const sharedIds = getSharedObjectIds();
  if (!sharedIds.patientRegistry) {
    throw new Error('PatientRegistry shared object ID not configured');
  }
  return getObjectFields(client, sharedIds.patientRegistry);
}

/**
 * Parse events from a transaction result and filter by type.
 */
export function parseEvents(
  events: any[],
  eventType: string
): any[] {
  return (events || []).filter(
    (e) => e.type && e.type.includes(eventType)
  ).map((e) => e.parsedJson || e);
}

/**
 * Convert a hex string to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to a hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a string to a UTF-8 byte array suitable for passing as
 * `vector<u8>` to a Move function.
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert a Move `vector<u8>` field (returned as number[]) to a UTF-8 string.
 */
export function bytesToString(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

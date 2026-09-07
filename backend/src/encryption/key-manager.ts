/**
 * Key Manager — per-entry key generation, wrapping, and storage.
 *
 * Each medical entry gets a unique 256-bit AES-GCM key (see index.ts).
 * When access is granted to a grantee, the entry key is "wrapped"
 * (encrypted with a key derived from the grantee's Sui address) and
 * stored in PostgreSQL in the `entry_keys` table.
 *
 * On read, the grantee's wrapping key is re-derived to unwrap the
 * entry key, which is then used to decrypt the document.
 */

import { getDb } from '../db';
import {
  generateEntryKey,
  deriveWrappingKey,
  encryptWithAES,
  decryptWithAES,
} from './index';
import type { EncryptedPayload } from './index';

// ─── Types ─────────────────────────────────────────────────

export interface StoredWrappedKey {
  entryId: number;
  historyId: string;
  granteeAddr: string;
  /** The entry key, encrypted with the grantee's wrapping key. */
  wrappedKey: EncryptedPayload;
  createdAt: Date;
}

// ─── Key Lifecycle ─────────────────────────────────────────

/**
 * Generate a new entry key and store it wrapped for the history owner.
 * Called when a new entry is created.
 *
 * @param historyId - The MedicalHistory object ID.
 * @param entryId - The on-chain entry ID (emitted from the Move event).
 * @param ownerAddr - The patient's Sui address (history owner).
 * @returns The generated 32-byte entry key (needed for immediate wrapping).
 */
export async function createEntryKey(
  historyId: string,
  entryId: number,
  ownerAddr: string
): Promise<Buffer> {
  const entryKey = generateEntryKey();

  // Wrap the entry key for the owner (patient)
  const ownerWrappingKey = deriveWrappingKey(ownerAddr);
  const wrapped = encryptWithAES(entryKey, ownerWrappingKey);

  // Persist in PostgreSQL
  const db = getDb();
  await db.query(
    `INSERT INTO entry_keys (history_id, entry_id, grantee_addr, wrapped_key_iv, wrapped_key_ciphertext, wrapped_key_tag)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (history_id, entry_id, grantee_addr) DO NOTHING`,
    [historyId, entryId, ownerAddr, wrapped.iv, wrapped.ciphertext, wrapped.tag]
  );

  return entryKey;
}

/**
 * Wrap an existing entry key for a new grantee.
 * Called when an access grant is created.
 *
 * @param historyId - The MedicalHistory object ID.
 * @param entryId - The entry ID to grant access to.
 * @param granteeAddr - The grantee's Sui address.
 * @returns true if the key was wrapped and stored.
 */
export async function wrapKeyForGrantee(
  historyId: string,
  entryId: number,
  granteeAddr: string
): Promise<boolean> {
  const db = getDb();

  // Retrieve the entry key wrapped for the owner (we use it as the "source of truth")
  const { rows } = await db.query(
    `SELECT wrapped_key_iv, wrapped_key_ciphertext, wrapped_key_tag
     FROM entry_keys
     WHERE history_id = $1 AND entry_id = $2
     LIMIT 1`,
    [historyId, entryId]
  );

  if (rows.length === 0) {
    console.warn(`[KeyManager] No entry key found for history=${historyId} entry=${entryId}`);
    return false;
  }

  // First, we need the owner address to derive the wrapping key.
  // We get it from history_metadata.
  const { rows: metaRows } = await db.query(
    `SELECT patient_addr FROM history_metadata WHERE history_id = $1`,
    [historyId]
  );
  if (metaRows.length === 0) {
    console.warn(`[KeyManager] No history metadata found for ${historyId}`);
    return false;
  }
  const ownerAddr = metaRows[0].patient_addr;

  // Decrypt the entry key using the owner's wrapping key
  const ownerWrappingKey = deriveWrappingKey(ownerAddr);
  const wrappedOwnerKey: EncryptedPayload = {
    iv: rows[0].wrapped_key_iv,
    ciphertext: rows[0].wrapped_key_ciphertext,
    tag: rows[0].wrapped_key_tag,
  };

  let entryKey: Buffer;
  try {
    entryKey = decryptWithAES(wrappedOwnerKey, ownerWrappingKey);
  } catch (err) {
    console.error(`[KeyManager] Failed to unwrap entry key for grant:`, err);
    return false;
  }

  // Re-wrap for the grantee
  const granteeWrappingKey = deriveWrappingKey(granteeAddr);
  const wrappedForGrantee = encryptWithAES(entryKey, granteeWrappingKey);

  // Store in PostgreSQL
  await db.query(
    `INSERT INTO entry_keys (history_id, entry_id, grantee_addr, wrapped_key_iv, wrapped_key_ciphertext, wrapped_key_tag)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (history_id, entry_id, grantee_addr) DO UPDATE
       SET wrapped_key_iv = $4, wrapped_key_ciphertext = $5, wrapped_key_tag = $6`,
    [historyId, entryId, granteeAddr, wrappedForGrantee.iv, wrappedForGrantee.ciphertext, wrappedForGrantee.tag]
  );

  return true;
}

/**
 * Retrieve and unwrap an entry key for a specific user.
 * Called when a user (owner or grantee) wants to decrypt a document.
 *
 * @param historyId - The MedicalHistory object ID.
 * @param entryId - The entry ID.
 * @param userAddr - The requesting user's Sui address.
 * @returns The 32-byte AES entry key, or null if not permitted/found.
 */
export async function getEntryKeyForUser(
  historyId: string,
  entryId: number,
  userAddr: string
): Promise<Buffer | null> {
  const db = getDb();

  const { rows } = await db.query(
    `SELECT wrapped_key_iv, wrapped_key_ciphertext, wrapped_key_tag
     FROM entry_keys
     WHERE history_id = $1 AND entry_id = $2 AND grantee_addr = $3`,
    [historyId, entryId, userAddr]
  );

  if (rows.length === 0) {
    return null;
  }

  const wrappingKey = deriveWrappingKey(userAddr);
  const wrappedKey: EncryptedPayload = {
    iv: rows[0].wrapped_key_iv,
    ciphertext: rows[0].wrapped_key_ciphertext,
    tag: rows[0].wrapped_key_tag,
  };

  try {
    return decryptWithAES(wrappedKey, wrappingKey);
  } catch (err) {
    console.error(`[KeyManager] Failed to unwrap key for user ${userAddr}:`, err);
    return null;
  }
}

/**
 * Check if a user has a stored key for a specific entry (i.e., has access).
 */
export async function hasKeyForEntry(
  historyId: string,
  entryId: number,
  userAddr: string
): Promise<boolean> {
  const db = getDb();
  const { rows } = await db.query(
    `SELECT 1 FROM entry_keys WHERE history_id = $1 AND entry_id = $2 AND grantee_addr = $3`,
    [historyId, entryId, userAddr]
  );
  return rows.length > 0;
}


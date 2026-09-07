/**
 * Document Service — Orchestrator.
 *
 * Coordinates the full pipeline:
 *   1. Encrypt raw document bytes with AES-256-GCM (using a per-entry key)
 *   2. Upload encrypted blob to IPFS → get CID
 *   3. Store per-entry key (wrapped for the owner) in PostgreSQL
 *   4. Return { offChainRef (CID), contentHash (SHA-256 hex) }
 *
 * This service is called by the route handlers when creating new entries.
 * The returned values are what gets written on-chain.
 */

import crypto from 'crypto';
import { encryptDocument, deriveWrappingKey, encryptWithAES } from '../encryption';
import { uploadToIPFS } from './ipfs';
import { getDb } from '../db';

// ─── Types ─────────────────────────────────────────────────

export interface ProcessedDocument {
  /** The IPFS CID of the encrypted blob — this becomes `off_chain_ref`. */
  offChainRef: string;
  /** SHA-256 hex digest of the encrypted blob — this becomes `content_hash`. */
  contentHash: string;
  /** Size of the encrypted blob in bytes. */
  encryptedSize: number;
}

// ─── Service ───────────────────────────────────────────────

/**
 * Process a document for on-chain storage:
 *   1. Encrypt with AES-256-GCM (per-entry key)
 *   2. Upload encrypted blob to IPFS
 *   3. Store the entry key wrapped for the owner in PostgreSQL
 *   4. Return offChainRef (CID) and contentHash (SHA-256 hex)
 *
 * @param documentBytes - The raw document bytes (PDF, text, image, etc.).
 * @param historyId - The MedicalHistory object ID (0x-prefixed hex).
 * @param entryId - The on-chain entry ID (from the Move event).
 * @param ownerAddr - The patient's Sui address (history owner).
 * @returns The CID and content hash ready for on-chain storage.
 */
export async function processDocument(
  documentBytes: Buffer,
  historyId: string,
  entryId: number,
  ownerAddr: string
): Promise<ProcessedDocument> {
  // 1. Generate a fresh per-entry AES-256 key
  const entryKey = crypto.randomBytes(32);

  // 2. Encrypt the document
  const { encrypted, contentHash } = encryptDocument(documentBytes, entryKey);

  // 3. Serialise for IPFS: concat(iv + ciphertext + tag) as raw bytes
  const encryptedBlob = Buffer.concat([
    Buffer.from(encrypted.iv, 'base64'),
    Buffer.from(encrypted.ciphertext, 'base64'),
    Buffer.from(encrypted.tag, 'base64'),
  ]);

  // 4. Upload encrypted blob to IPFS
  const { cid, size } = await uploadToIPFS(encryptedBlob, `entry-${entryId}.enc`);

  // 5. Wrap the entry key for the owner and store in PostgreSQL
  const ownerWrappingKey = deriveWrappingKey(ownerAddr);
  const wrapped = encryptWithAES(entryKey, ownerWrappingKey);

  const db = getDb();
  await db.query(
    `INSERT INTO entry_keys (history_id, entry_id, grantee_addr, wrapped_key_iv, wrapped_key_ciphertext, wrapped_key_tag)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (history_id, entry_id, grantee_addr) DO NOTHING`,
    [historyId, entryId, ownerAddr, wrapped.iv, wrapped.ciphertext, wrapped.tag]
  );

  console.log(
    `[DocService] Processed entry ${entryId} for history ${historyId}: ` +
    `CID=${cid}, contentHash=${contentHash.substring(0, 16)}..., size=${size}`
  );

  return {
    offChainRef: cid,
    contentHash,
    encryptedSize: size,
  };
}


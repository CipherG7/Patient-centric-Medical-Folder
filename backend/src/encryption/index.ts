/**
 * Encryption layer — AES-256-GCM document encrypt/decrypt.
 *
 * DESIGN DECISION (per-entry keys):
 *   Each medical entry gets its own random 256-bit AES-GCM key.
 *   Rationale:
 *     - Minimises key-compromise blast radius: one leaked key
 *       exposes only one entry, not the entire history.
 *     - Aligns with the on-chain partial-access model: grantees
 *       receive only the entry keys they have permission for.
 *     - Key wrapping (encrypting entry keys for each grantee) uses
 *       a deterministic key derived from the grantee's Sui address
 *       via PBKDF2 — acceptable for the prototype.
 *
 *   Production recommendation:
 *     Replace PBKDF2-derived wrapping with asymmetric encryption
 *     (e.g., NaCl box / X25519-XSalsa20-Poly1305) where each user
 *     has a Curve25519 keypair. The grant process would then:
 *       1. Fetch the grantee's public key from their Sui profile.
 *       2. Encrypt the entry key with their public key.
 *       3. Store the ciphertext in the entry_keys table.
 */

import crypto from 'crypto';
import { config } from '../config';

// ─── Constants ─────────────────────────────────────────────

/** AES-256-GCM key length in bytes. */
export const AES_KEY_LENGTH = 32; // 256 bits

/** AES-GCM IV length in bytes. */
export const IV_LENGTH = 12; // 96 bits (recommended for GCM)

/** AES-GCM auth tag length in bytes. */
export const AUTH_TAG_LENGTH = 16; // 128 bits

// ─── Types ─────────────────────────────────────────────────

export interface EncryptedPayload {
  /** Base64-encoded ciphertext (without IV/tag). */
  ciphertext: string;
  /** Base64-encoded initialisation vector. */
  iv: string;
  /** Base64-encoded GCM authentication tag. */
  tag: string;
}

export interface EncryptedEntryDocument {
  /** The encrypted payload. */
  encrypted: EncryptedPayload;
  /** SHA-256 hex digest of the *encrypted* bytes (for on-chain integrity). */
  contentHash: string;
}

// ─── Key Derivation ────────────────────────────────────────

/**
 * Derive a 256-bit wrapping key from a Sui address.
 *
 * The salt is a fixed application secret so the same Sui address
 * always yields the same wrapping key — this lets us re-derive it
 * on decrypt without extra storage.
 *
 * In production, each user would have an asymmetric keypair and
 * this function would be replaced by `crypto.publicEncrypt` /
 * `crypto.privateDecrypt`.
 */
export function deriveWrappingKey(
  suiAddress: string,
  appSalt?: string
): Buffer {
  return crypto.pbkdf2Sync(
    suiAddress,
    appSalt || config.ENCRYPTION_SALT,
    100_000, // 100k iterations — OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
    AES_KEY_LENGTH,
    'sha256'
  );
}

// ─── Encryption ────────────────────────────────────────────

/**
 * Generate a new random 256-bit AES key.
 */
export function generateEntryKey(): Buffer {
  return crypto.randomBytes(AES_KEY_LENGTH);
}

/**
 * Encrypt a plaintext byte buffer with AES-256-GCM.
 *
 * @param plaintext - Data to encrypt (raw bytes).
 * @param key - 32-byte AES key.
 * @returns The IV, ciphertext, and auth tag (all base64).
 */
export function encryptWithAES(
  plaintext: Buffer,
  key: Buffer
): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.alloc(0)); // No additional authenticated data

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a ciphertext with AES-256-GCM.
 *
 * @param payload - The IV, ciphertext, and auth tag (all base64).
 * @param key - 32-byte AES key.
 * @returns The decrypted plaintext bytes.
 * @throws If the auth tag verification fails (data tampered).
 */
export function decryptWithAES(
  payload: EncryptedPayload,
  key: Buffer
): Buffer {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAAD(Buffer.alloc(0));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
}

// ─── Full Document Encryption Pipeline ─────────────────────

/**
 * Encrypt a document, compute the on-chain content hash,
 * and return everything needed for storage and on-chain recording.
 *
 * @param documentBytes - Raw document bytes (PDF, text, image, etc.).
 * @param entryKey - 32-byte AES key for this entry (use generateEntryKey()).
 * @returns Encrypted payload + SHA-256 content hash.
 */
export function encryptDocument(
  documentBytes: Buffer,
  entryKey: Buffer
): EncryptedEntryDocument {
  // 1. Encrypt the document
  const encrypted = encryptWithAES(documentBytes, entryKey);

  // 2. Compute SHA-256 of the *encrypted* bytes (ciphertext + iv + tag)
  const encryptedBytes = Buffer.concat([
    Buffer.from(encrypted.iv, 'base64'),
    Buffer.from(encrypted.ciphertext, 'base64'),
    Buffer.from(encrypted.tag, 'base64'),
  ]);
  const contentHash = crypto.createHash('sha256').update(encryptedBytes).digest('hex');

  return { encrypted, contentHash };
}

/**
 * Decrypt a document using an entry key.
 * Re-verifies integrity via GCM auth tag.
 *
 * @param payload - The encrypted payload.
 * @param entryKey - 32-byte AES key.
 * @returns Decrypted document bytes.
 */
export function decryptDocument(
  payload: EncryptedPayload,
  entryKey: Buffer
): Buffer {
  return decryptWithAES(payload, entryKey);
}

/**
 * Verify that encrypted bytes match a known content hash.
 */
export function verifyContentHash(
  encrypted: EncryptedPayload,
  expectedHash: string
): boolean {
  const encryptedBytes = Buffer.concat([
    Buffer.from(encrypted.iv, 'base64'),
    Buffer.from(encrypted.ciphertext, 'base64'),
    Buffer.from(encrypted.tag, 'base64'),
  ]);
  const actualHash = crypto.createHash('sha256').update(encryptedBytes).digest('hex');
  return actualHash === expectedHash;
}


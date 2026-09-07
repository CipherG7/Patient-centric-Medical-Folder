/**
 * IPFS Storage Client.
 *
 * Uploads encrypted blobs to IPFS via the Kubo RPC API and returns CIDs.
 * For development / demo mode without a running IPFS node, a local
 * filesystem fallback is used — blobs are stored under `./data/ipfs/`
 * keyed by a synthetic CID.
 *
 * DESIGN DECISION:
 *   The IPFS endpoint is configurable so the prototype can work without
 *   a running IPFS node. In production, point this at a Pinata / Infura /
 *   Kubo endpoint and enable IPFS-based content addressing.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

// ─── Types ─────────────────────────────────────────────────

export interface UploadResult {
  /** The CID (Content Identifier) string — this goes on-chain as off_chain_ref. */
  cid: string;
  /** Size of the uploaded blob in bytes. */
  size: number;
}

// ─── Helpers ───────────────────────────────────────────────

/**
 * Generate a synthetic CID-like hash for the local fallback mode.
 * Uses SHA-256 truncated to 46 chars (similar to v1 CID length) prefixed
 * with "Qm" to mimic IPFS-style CIDs for compatibility.
 */
function generateLocalCid(data: Buffer): string {
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  // Local CIDs are prefixed with "local-" for clear identification
  return `local-${hash.substring(0, 46)}`;
}

/**
 * Ensure the local IPFS storage directory exists.
 */
function ensureLocalDir(): string {
  const dir = path.resolve(config.IPFS_LOCAL_DIR || './data/ipfs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─── Upload ─────────────────────────────────────────────────

/**
 * Upload a blob (encrypted bytes) to IPFS.
 *
 * @param data - The raw bytes to upload (already encrypted).
 * @param filename - Optional filename hint for the IPFS node.
 * @returns The CID and byte size.
 */
export async function uploadToIPFS(
  data: Buffer,
  filename?: string
): Promise<UploadResult> {
  if (!config.IPFS_ENABLED || config.IPFS_API_URL === 'local') {
    return uploadLocal(data);
  }

  // ─── Real IPFS Kubo RPC upload ──────────────────────
  try {
    const url = `${config.IPFS_API_URL}/api/v0/add`;
    const formData = new FormData();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    formData.append('file', blob, filename || 'entry.bin');

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
    }

    const result: any = await response.json();
    return {
      cid: result.Hash || result.cid,
      size: result.Size || data.length,
    };
  } catch (err) {
    console.warn(`[IPFS] Remote upload failed, falling back to local: ${err}`);
    return uploadLocal(data);
  }
}

/**
 * Fallback: store blob in local filesystem with a synthetic CID.
 */
async function uploadLocal(data: Buffer): Promise<UploadResult> {
  const cid = generateLocalCid(data);
  const dir = ensureLocalDir();
  const filePath = path.join(dir, cid);

  // Write atomically via temp file
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath);

  console.log(`[IPFS] Local upload: ${cid} (${data.length} bytes)`);

  return { cid, size: data.length };
}

// ─── Download ──────────────────────────────────────────────

/**
 * Download a blob from IPFS by CID.
 *
 * @param cid - The CID to fetch.
 * @returns The raw bytes.
 */
export async function downloadFromIPFS(cid: string): Promise<Buffer> {
  if (!config.IPFS_ENABLED || config.IPFS_API_URL === 'local') {
    return downloadLocal(cid);
  }

  // ─── Real IPFS gateway fetch ────────────────────────
  try {
    const gatewayUrl = config.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs';
    const url = `${gatewayUrl}/${cid}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`IPFS download failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (err) {
    console.warn(`[IPFS] Remote download failed, falling back to local: ${err}`);
    return downloadLocal(cid);
  }
}

/**
 * Fallback: read blob from local filesystem.
 */
async function downloadLocal(cid: string): Promise<Buffer> {
  const dir = ensureLocalDir();
  const filePath = path.join(dir, cid);

  if (!fs.existsSync(filePath)) {
    throw new Error(`[IPFS] Local blob not found: ${cid}`);
  }

  return fs.readFileSync(filePath);
}

/**
 * Check if a blob exists locally (for the fallback mode).
 */
export function existsLocally(cid: string): boolean {
  if (!cid.startsWith('local-')) return false;
  const dir = ensureLocalDir();
  return fs.existsSync(path.join(dir, cid));
}


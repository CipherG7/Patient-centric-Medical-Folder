/**
 * Walrus blob storage client.
 *
 * Documents are encrypted before reaching this module. Walrus stores the
 * resulting immutable bytes; the blob ID is recorded on-chain in off_chain_ref.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface UploadResult {
  blobId: string;
  size: number;
}

function localPath(blobId: string): string {
  const directory = path.resolve(config.WALRUS_LOCAL_DIR);
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, blobId);
}

function uploadLocal(data: Buffer): UploadResult {
  const blobId = `local-${crypto.createHash('sha256').update(data).digest('hex')}`;
  const destination = localPath(blobId);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, data);
  fs.renameSync(temporary, destination);
  console.log(`[Walrus] Local upload: ${blobId} (${data.length} bytes)`);
  return { blobId, size: data.length };
}

export async function uploadToWalrus(data: Buffer): Promise<UploadResult> {
  if (!config.WALRUS_ENABLED) return uploadLocal(data);

  const url = `${config.WALRUS_PUBLISHER_URL.replace(/\/$/, '')}/v1/blobs?epochs=${config.WALRUS_EPOCHS}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: data,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as {
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
  };
  const blobId =
    payload.newlyCreated?.blobObject?.blobId ||
    payload.alreadyCertified?.blobId;
  if (!blobId) throw new Error('Walrus upload response did not include a blob ID');
  return { blobId, size: data.length };
}

export async function downloadFromWalrus(blobId: string): Promise<Buffer> {
  if (!config.WALRUS_ENABLED) {
    const filePath = localPath(blobId);
    if (!fs.existsSync(filePath)) throw new Error(`[Walrus] Local blob not found: ${blobId}`);
    return fs.readFileSync(filePath);
  }

  const url = `${config.WALRUS_AGGREGATOR_URL.replace(/\/$/, '')}/v1/blobs/${encodeURIComponent(blobId)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Walrus download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

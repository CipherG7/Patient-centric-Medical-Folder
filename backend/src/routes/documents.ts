/**
 * Document upload and retrieval routes.
 *
 * POST   /api/documents/upload          - Upload & encrypt a document for a history entry
 * GET    /api/documents/:cid            - Download & decrypt a document (requires access)
 *
 * This is the REST interface to the encryption + Walrus storage layer.
 * The typical flow:
 *   1. Institution creates an on-chain entry via POST /api/history/:historyId/entry
 *      → gets back an entryId and stores offChainRef + contentHash
 *   2. Institution uploads the actual document via POST /api/documents/upload
 *      → service encrypts, uploads to Walrus, stores key
 *   3. Grantee downloads via GET /api/documents/:cid with proper access
 */

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { processDocument } from '../storage/document-service';
import { downloadFromWalrus } from '../storage/walrus';
import { getEntryKeyForUser } from '../encryption/key-manager';
import { decryptDocument, verifyContentHash } from '../encryption';
import { getDb } from '../db';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth } from '../middleware/auth';
import { recordOffchainAuditEvent } from '../audit/offchain';

const router = Router();

// ─── Multer config (file upload) ───────────────────────────

/**
 * In-memory file storage (max 10 MB).
 * Files are kept in RAM as Buffer — suitable for the prototype.
 * In production, stream to disk or S3 and pass the buffer through.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

// ─── Schemas ────────────────────────────────────────────────

const UploadBodySchema = z.object({
  historyId: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui object ID'),
  entryId: z.number().int().min(0),
  ownerAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address').optional(),
});

const DownloadParamsSchema = z.object({
  cid: z.string().min(1, 'CID is required'),
});

const VerifyQuerySchema = z.object({
  contentHash: z.string().length(64, 'SHA-256 hex must be 64 characters'),
});

// ─── Routes ─────────────────────────────────────────────────

/**
 * Upload a document for a medical history entry.
 *
 * Flow:
 *   1. Receives a file (multipart/form-data) + metadata in fields
 *   2. Encrypts the file with AES-256-GCM (per-entry key)
 *   3. Uploads encrypted blob to Walrus
 *   4. Stores entry key wrapped for the owner
 *   5. Returns offChainRef (Walrus blob ID) and contentHash (SHA-256 hex)
 *
 * The caller should then create the on-chain entry with these values
 * via POST /api/history/:historyId/entry.
 */
router.post(
  '/upload',
  apiKeyAuth,
  upload.single('document'),
  validate({ body: UploadBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError('Document file is required (multipart/form-data field: "document")', 400);
      }

      const { historyId, entryId } = req.body;
      const ownerAddr = req.user!.address;

      // Process the document through the full pipeline
      const result = await processDocument(
        req.file.buffer,
        historyId,
        entryId,
        ownerAddr
      );
      await recordOffchainAuditEvent({
        action: 'document_uploaded',
        actorAddr: ownerAddr,
        actorRole: req.user!.role,
        historyId,
        entryId,
        targetType: 'document',
        targetId: String(entryId),
        result: 'success',
        metadata: { encryptedSize: result.encryptedSize },
        requestId: req.requestId,
      });

      res.status(201).json({
        success: true,
        message: 'Document encrypted and stored successfully',
        offChainRef: result.offChainRef,
        contentHash: result.contentHash,
        encryptedSize: result.encryptedSize,
        entryId,
        historyId,
      });
    } catch (err) {
      if (req.user && typeof req.body?.historyId === 'string') {
        await recordOffchainAuditEvent({
          action: 'document_upload_failed',
          actorAddr: req.user.address,
          actorRole: req.user.role,
          historyId: req.body.historyId,
          entryId: Number.isInteger(req.body?.entryId) ? req.body.entryId : null,
          targetType: 'document',
          result: 'failure',
          metadata: { reasonCode: err instanceof AppError ? err.statusCode : 500 },
          requestId: req.requestId,
        }).catch(() => undefined);
      }
      next(err);
    }
  }
);

/**
 * Download and decrypt a document.
 *
 * The caller must have access to the entry (verified on-chain via
 * the permission system AND have a stored wrapped key in PostgreSQL).
 *
 * Query params:
 *   - entryId: The on-chain entry ID (required)
 *   - historyId: The MedicalHistory object ID (required)
 *   - contentHash: SHA-256 hex to verify integrity (optional, recommended)
 */
router.get(
  '/:cid',
  apiKeyAuth,
  validate({ params: DownloadParamsSchema }),
  async (req, res, next) => {
    try {
      const { cid } = req.params;
      const entryId = parseInt(req.query.entryId as string, 10);
      const historyId = req.query.historyId as string;
      const expectedHash = req.query.contentHash as string | undefined;
      const verifyOnly = req.query.verifyOnly === 'true';

      if (!req.user) {
        throw new AppError('Authentication required to download documents', 401);
      }
      if (isNaN(entryId)) {
        throw new AppError('Query parameter "entryId" is required and must be a number', 400);
      }
      if (!historyId) {
        throw new AppError('Query parameter "historyId" is required', 400);
      }
      if (verifyOnly && !expectedHash) {
        throw new AppError('A content hash is required for integrity verification', 400);
      }

      const userAddr = req.user.address;

      // 1. Check if user has a stored key (implies on-chain access was granted)
      const entryKey = await getEntryKeyForUser(historyId, entryId, userAddr);
      if (!entryKey) {
        throw new AppError(
          'Access denied: No decryption key available for this entry. ' +
          'Ensure access has been granted on-chain.',
          403
        );
      }

      // 2. Download encrypted blob from Walrus
      const encryptedBlob = await downloadFromWalrus(cid);

      // 3. Parse the blob back into iv + ciphertext + tag
      if (encryptedBlob.length < 28) {
        // 12 (iv) + 16 (tag) minimum
        throw new AppError('Corrupted encrypted blob', 500);
      }

      const iv = encryptedBlob.subarray(0, 12).toString('base64');
      const tag = encryptedBlob.subarray(encryptedBlob.length - 16).toString('base64');
      const ciphertext = encryptedBlob.subarray(12, encryptedBlob.length - 16).toString('base64');

      const encryptedPayload = { iv, ciphertext, tag };

      // 4. Verify content hash if provided
      if (expectedHash) {
        const isValid = verifyContentHash(encryptedPayload, expectedHash);
        if (!isValid) {
          await recordOffchainAuditEvent({
            action: 'document_integrity_check_failed',
            actorAddr: userAddr,
            actorRole: req.user.role,
            historyId,
            entryId,
            targetType: 'document',
            targetId: String(entryId),
            result: 'failure',
            metadata: { reason: 'content_hash_mismatch' },
            requestId: req.requestId,
          });
          throw new AppError('Content hash mismatch: data may have been tampered with', 409);
        }
      }

      if (verifyOnly) {
        await recordOffchainAuditEvent({
          action: 'document_integrity_verified',
          actorAddr: userAddr,
          actorRole: req.user.role,
          historyId,
          entryId,
          targetType: 'document',
          targetId: String(entryId),
          result: 'success',
          requestId: req.requestId,
        });
        res.json({ success: true, verified: true });
        return;
      }

      // 5. Decrypt the document
      const plaintext = decryptDocument(encryptedPayload, entryKey);

      await recordOffchainAuditEvent({
        action: 'history_read',
        actorAddr: userAddr,
        actorRole: req.user.role,
        historyId,
        entryId,
        targetType: 'history_entry',
        targetId: String(entryId),
        result: 'success',
        metadata: { accessMethod: 'view_pdf' },
        requestId: req.requestId,
      });

      // 6. Return the decrypted document
      // For the prototype, we return it as a download with original filename
      const filename = `entry-${historyId}-${entryId}.bin`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', plaintext.length.toString());
      res.send(plaintext);
    } catch (err) {
      if (req.user && typeof req.query.historyId === 'string') {
        await recordOffchainAuditEvent({
          action: 'document_access_failed',
          actorAddr: req.user.address,
          actorRole: req.user.role,
          historyId: req.query.historyId,
          entryId: Number.isInteger(Number(req.query.entryId)) ? Number(req.query.entryId) : null,
          targetType: 'document',
          result: 'failure',
          metadata: { reasonCode: err instanceof AppError ? err.statusCode : 500 },
          requestId: req.requestId,
        }).catch(() => undefined);
      }
      next(err);
    }
  }
);

export default router;

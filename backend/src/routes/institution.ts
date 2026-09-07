/**
 * Institution management routes.
 *
 * POST   /api/institutions/register     - Register a new institution (admin only)
 * POST   /api/institutions/revoke       - Revoke an institution (admin only)
 * POST   /api/institutions/reinstate    - Reinstate a revoked institution (admin only)
 * GET    /api/institutions/:addr        - Get institution info (public)
 * GET    /api/institutions              - List all institutions (public)
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSuiClient, getAdminKeypair, getAdminAddress } from '../sui/client';
import {
  buildRegisterInstitutionPTB,
  buildRevokeInstitutionPTB,
  buildReinstateInstitutionPTB,
  executeTx,
} from '../sui/transactions';
import { getSharedObjectIds } from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────

const RegisterSchema = z.object({
  institutionAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  name: z.string().min(1).max(256),
  licenseNumber: z.string().min(1).max(128),
});

const RevokeSchema = z.object({
  institutionAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});

const ReinstateSchema = z.object({
  institutionAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});

const AddrParamSchema = z.object({
  addr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});

// ─── Routes ─────────────────────────────────────────────────

/**
 * Register a new institution.
 * Requires AdminCap — signed by the admin keypair.
 */
router.post(
  '/register',
  apiKeyAuth,
  validate({ body: RegisterSchema }),
  async (req, res, next) => {
    try {
      const { institutionAddr, name, licenseNumber } = req.body;
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.institutionRegistry) {
        throw new AppError('InstitutionRegistry shared object ID not configured', 500);
      }

      // The AdminCap object ID must be known. In practice the admin
      // stores it after publish. For the demo, it can be passed as a header
      // or env var.
      const adminCapId = req.headers['x-admin-cap-id'] as string;
      if (!adminCapId) {
        throw new AppError('AdminCap object ID required in x-admin-cap-id header', 400);
      }

      const tx = buildRegisterInstitutionPTB(
        sharedIds,
        adminCapId,
        institutionAddr,
        name,
        licenseNumber,
        Date.now()
      );

      const result = await executeTx(client, tx, signer);

      // Also store metadata in PostgreSQL
      const db = getDb();
      await db.query(
        `INSERT INTO institution_profiles (institution_addr, name, license_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (institution_addr) DO UPDATE SET name = $2, license_number = $3`,
        [institutionAddr, name, licenseNumber]
      );

      res.status(201).json({
        success: true,
        digest: result.digest,
        institutionAddr,
        name,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Revoke an institution's verified status.
 */
router.post(
  '/revoke',
  apiKeyAuth,
  validate({ body: RevokeSchema }),
  async (req, res, next) => {
    try {
      const { institutionAddr } = req.body;
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();
      const adminCapId = req.headers['x-admin-cap-id'] as string;

      if (!adminCapId) {
        throw new AppError('AdminCap object ID required in x-admin-cap-id header', 400);
      }

      const tx = buildRevokeInstitutionPTB(sharedIds, adminCapId, institutionAddr);
      const result = await executeTx(client, tx, signer);

      res.json({
        success: true,
        digest: result.digest,
        institutionAddr,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Reinstate a previously revoked institution.
 */
router.post(
  '/reinstate',
  apiKeyAuth,
  validate({ body: ReinstateSchema }),
  async (req, res, next) => {
    try {
      const { institutionAddr } = req.body;
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();
      const adminCapId = req.headers['x-admin-cap-id'] as string;

      if (!adminCapId) {
        throw new AppError('AdminCap object ID required in x-admin-cap-id header', 400);
      }

      const tx = buildReinstateInstitutionPTB(sharedIds, adminCapId, institutionAddr);
      const result = await executeTx(client, tx, signer);

      res.json({
        success: true,
        digest: result.digest,
        institutionAddr,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Get institution profile by address.
 * Reads from PostgreSQL cache + on-chain registry for verified status.
 */
router.get(
  '/:addr',
  validate({ params: AddrParamSchema }),
  async (req, res, next) => {
    try {
      const { addr } = req.params;

      // Get profile from PostgreSQL
      const db = getDb();
      const { rows } = await db.query(
        'SELECT * FROM institution_profiles WHERE institution_addr = $1',
        [addr]
      );

      if (rows.length === 0) {
        throw new AppError('Institution not found', 404);
      }

      // In a full implementation, we'd also query the on-chain
      // InstitutionRegistry to get the `verified` status.

      res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * List all registered institutions (from PostgreSQL cache).
 */
router.get('/', async (_req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(
      'SELECT * FROM institution_profiles ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;


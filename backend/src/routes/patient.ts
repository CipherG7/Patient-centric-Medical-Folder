/**
 * Patient management routes.
 *
 * POST   /api/patients/history         - Create a new medical history
 * GET    /api/patients/:addr/history   - Lookup patient's history ID
 * POST   /api/patients/profile         - Create/update patient profile (off-chain)
 * GET    /api/patients/:addr/profile   - Get patient profile
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSuiClient, getAdminKeypair } from '../sui/client';
import { buildCreateHistoryPTB, executeTx } from '../sui/transactions';
import { getSharedObjectIds } from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth, optionalAuth } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();

// ─── Schemas ────────────────────────────────────────────────

const CreateHistorySchema = z.object({
  patientAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});

const PatientProfileSchema = z.object({
  patientAddr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
  displayName: z.string().max(128).optional(),
  email: z.string().email().optional().or(z.literal('')),
});

const AddrParamSchema = z.object({
  addr: z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address'),
});

// ─── Routes ─────────────────────────────────────────────────

/**
 * Create a new medical history for a patient.
 *
 * DESIGN NOTE: In this demo, the backend signs and submits the
 * transaction. In production, the patient would sign it themselves
 * via Sui Wallet (the PTB construction is the same — see the
 * tradeoff note in sui/client.ts).
 */
router.post(
  '/history',
  apiKeyAuth,
  validate({ body: CreateHistorySchema }),
  async (req, res, next) => {
    try {
      const { patientAddr } = req.body;
      const client = getSuiClient();
      const signer = getAdminKeypair();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.patientRegistry) {
        throw new AppError('PatientRegistry shared object ID not configured', 500);
      }

      const tx = buildCreateHistoryPTB(sharedIds);
      const result = await executeTx(client, tx, signer);

      // Parse the HistoryCreated event to get the new history ID
      const historyCreatedEvent = (result.effects?.events || []).find(
        (e: any) => e.type?.includes('medical_history::medical_history::HistoryCreated')
      );
      const historyId = historyCreatedEvent?.parsedJson?.history_id;

      // Store off-chain metadata in PostgreSQL
      if (historyId) {
        const db = getDb();
        await db.query(
          `INSERT INTO user_profiles (user_address, role)
           VALUES ($1, 'patient')
           ON CONFLICT (user_address) DO NOTHING`,
          [patientAddr]
        );
        await db.query(
          `INSERT INTO history_metadata (history_id, patient_addr)
           VALUES ($1, $2)
           ON CONFLICT (history_id) DO NOTHING`,
          [historyId, patientAddr]
        );
      }

      res.status(201).json({
        success: true,
        digest: result.digest,
        historyId,
        patientAddr,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Lookup a patient's history object ID from the on-chain PatientRegistry.
 * Uses `devInspectTransactionBlock` for a read-only query (no gas cost).
 */
router.get(
  '/:addr/history',
  optionalAuth,
  validate({ params: AddrParamSchema }),
  async (req, res, next) => {
    try {
      const { addr } = req.params;
      const client = getSuiClient();
      const sharedIds = getSharedObjectIds();

      if (!sharedIds.patientRegistry) {
        throw new AppError('PatientRegistry shared object ID not configured', 500);
      }

      // Read the patient registry object directly
      const registryObj = await client.getObject({
        id: sharedIds.patientRegistry,
        options: { showContent: true },
      });

      if (!registryObj.data) {
        throw new AppError('PatientRegistry not found on-chain', 404);
      }

      // Parse the table to find the patient's history ID
      const fields = (registryObj.data as any).content?.fields;
      const histories = fields?.histories?.fields?.contents || [];

      // The table is stored as a vector of { key, value } pairs
      const match = histories.find(
        (entry: any) => entry.fields?.key === addr
      );

      if (!match) {
        throw new AppError('No history found for this patient', 404);
      }

      const historyId = match.fields?.value;

      // Also return off-chain metadata if available
      const db = getDb();
      const { rows } = await db.query(
        'SELECT * FROM history_metadata WHERE patient_addr = $1',
        [addr]
      );

      res.json({
        success: true,
        patientAddr: addr,
        historyId,
        metadata: rows[0] || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Create or update a patient's off-chain profile.
 */
router.post(
  '/profile',
  apiKeyAuth,
  validate({ body: PatientProfileSchema }),
  async (req, res, next) => {
    try {
      const { patientAddr, displayName, email } = req.body;
      const db = getDb();

      await db.query(
        `INSERT INTO user_profiles (user_address, display_name, email, role)
         VALUES ($1, $2, $3, 'patient')
         ON CONFLICT (user_address)
         DO UPDATE SET display_name = COALESCE($2, user_profiles.display_name),
                        email = COALESCE($3, user_profiles.email),
                        updated_at = now()`,
        [patientAddr, displayName || null, email || null]
      );

      const { rows } = await db.query(
        'SELECT * FROM user_profiles WHERE user_address = $1',
        [patientAddr]
      );

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
 * Get a patient's off-chain profile.
 */
router.get(
  '/:addr/profile',
  optionalAuth,
  validate({ params: AddrParamSchema }),
  async (req, res, next) => {
    try {
      const { addr } = req.params;
      const db = getDb();

      const { rows } = await db.query(
        'SELECT * FROM user_profiles WHERE user_address = $1',
        [addr]
      );

      if (rows.length === 0) {
        throw new AppError('Patient profile not found', 404);
      }

      res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;


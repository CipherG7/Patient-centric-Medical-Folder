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
import crypto from 'crypto';
import multer from 'multer';
import { getSuiClient, getAdminKeypair, getSuiObject } from '../sui/client';
import { buildCreateHistoryPTB, buildAddEntryPTB, executeTx } from '../sui/transactions';
import { getSharedObjectIds, parseEvents } from '../utils/sui-helpers';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { apiKeyAuth, optionalAuth } from '../middleware/auth';
import { getDb } from '../db';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

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

function unwrapEventJson(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (!('kind' in value)) return value;

  const kind = value.kind;
  switch (kind?.oneofKind) {
    case 'stringValue':
      return kind.stringValue;
    case 'numberValue':
      return kind.numberValue;
    case 'boolValue':
      return kind.boolValue;
    case 'structValue':
      return Object.fromEntries(
        Object.entries(kind.structValue?.fields || {}).map(([key, field]) => [
          key,
          unwrapEventJson(field),
        ])
      );
    case 'listValue':
      return (kind.listValue?.values || []).map((item: any) => unwrapEventJson(item));
    default:
      return null;
  }
}

const entryTypeNames: Record<string, number> = {
  diagnosis: 0,
  labreport: 1,
  'lab report': 1,
  prescription: 2,
  vaccination: 3,
  referral: 4,
  dischargesummary: 5,
  'discharge summary': 5,
  imagingreport: 6,
  'imaging report': 6,
};

function parseCsv(text: string): Array<Record<string, unknown>> {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];
  const parseRow = (row: string) => {
    const values: string[] = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"' && row[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(value.trim());
        value = '';
      } else {
        value += char;
      }
    }
    values.push(value.trim());
    return values;
  };
  const headers = parseRow(rows[0]).map((header) => header.toLowerCase());
  return rows.slice(1).map((row) => {
    const values = parseRow(row);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function parseImportFile(file: Express.Multer.File): Array<Record<string, unknown>> {
  const text = file.buffer.toString('utf8');
  if (file.originalname.toLowerCase().endsWith('.csv') || file.mimetype === 'text/csv') {
    return parseCsv(text);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError('Upload a valid JSON or CSV medical history file', 400);
  }
  const records = Array.isArray(parsed) ? parsed : (parsed as { entries?: unknown })?.entries;
  if (!Array.isArray(records) || records.length === 0 || records.some((record) => !record || typeof record !== 'object')) {
    throw new AppError('The file must contain a non-empty array of medical history records', 400);
  }
  return records as Array<Record<string, unknown>>;
}

function getEntryType(record: Record<string, unknown>): number {
  const raw = record.entryType ?? record.entry_type ?? record.type;
  const numericType = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isInteger(numericType) && numericType >= 0 && numericType <= 6) return numericType;
  const namedType = typeof raw === 'string' ? entryTypeNames[raw.trim().toLowerCase()] : undefined;
  if (namedType !== undefined) return namedType;
  throw new AppError('Each record needs entryType 0-6 or a supported entry type name', 400);
}

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
      const historyCreatedEvent = (result.events?.events || []).find(
        (e: any) => e.eventType?.endsWith('HistoryCreated')
      );
      const historyData = unwrapEventJson(historyCreatedEvent?.json);
      const historyIdFromEvent = historyData?.history_id;
      const historyObject = (result.objects?.objects || []).find(
        (object: any) =>
          object.objectType?.endsWith('::medical_history::MedicalHistory') &&
          object.previousTransaction === result.digest
      );
      const createdObject = (result.effects?.changedObjects || []).find(
        (object: any) => object.idOperation === 2 && object.objectId
      );
      const historyId = historyIdFromEvent || historyObject?.objectId || createdObject?.objectId;

      if (typeof historyId !== 'string' || !/^0x[0-9a-fA-F]{40,64}$/.test(historyId)) {
        throw new AppError(
          'History transaction succeeded but did not return a history object ID',
          502
        );
      }

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
 * Import patient-provided JSON or CSV records into the on-chain history.
 * JSON may be an array or { "entries": [...] }. CSV must include entryType
 * (or type); additional columns are retained for display.
 */
router.post(
  '/:addr/import',
  apiKeyAuth,
  upload.single('history'),
  validate({ params: AddrParamSchema }),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('History file is required', 400);
      const { addr } = req.params;
      const records = parseImportFile(req.file);
      const typedRecords = records.map((record) => ({
        record,
        entryType: getEntryType(record),
      }));
      const sharedIds = getSharedObjectIds();
      if (!sharedIds.institutionRegistry || !sharedIds.auditLog || !sharedIds.patientRegistry) {
        throw new AppError('Shared object IDs not configured', 500);
      }

      const requestedHistoryId = typeof req.body.historyId === 'string' &&
        /^0x[0-9a-fA-F]{40,64}$/.test(req.body.historyId)
        ? req.body.historyId
        : undefined;
      const client = getSuiClient();
      const registryObj = requestedHistoryId ? null : await getSuiObject(sharedIds.patientRegistry);
      const histories = (registryObj?.data as any)?.content?.fields?.histories?.fields?.contents || [];
      const historyId = requestedHistoryId || histories.find((entry: any) => entry.fields?.key === addr)?.fields?.value;
      if (!historyId) throw new AppError('No history found for this patient', 404);

      const signer = getAdminKeypair();
      const importId = crypto.randomUUID();
      const imported: Array<{ entryId: number; record: Record<string, unknown> }> = [];

      for (const { record, entryType } of typedRecords) {
        const contentHash = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
        const offChainRef = `patient-import://${importId}/${imported.length}`;
        const tx = buildAddEntryPTB(
          sharedIds,
          historyId,
          entryType,
          offChainRef,
          contentHash
        );
        const result = await executeTx(client, tx, signer);
        const event = parseEvents(result.effects?.events || [], 'EntryAdded')[0];
        if (!event?.entry_id) {
          throw new AppError('The imported record was not added to the medical history', 502);
        }
        imported.push({ entryId: Number(event.entry_id), record });
      }

      const db = getDb();
      for (const entry of imported) {
        await db.query(
          `INSERT INTO history_import_entries (history_id, entry_id, source_name, record)
           VALUES ($1, $2, $3, $4)`,
          [historyId, entry.entryId, req.file.originalname, JSON.stringify(entry.record)]
        );
      }

      res.status(201).json({
        success: true,
        historyId,
        importedCount: imported.length,
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
      const registryObj = await getSuiObject(sharedIds.patientRegistry);

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

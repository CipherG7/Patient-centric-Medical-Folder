import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { apiKeyAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address');

router.post(
  '/',
  apiKeyAuth,
  validate({ body: z.object({ patientAddr: AddressSchema }) }),
  async (req, res, next) => {
    try {
      const patientAddr = req.body.patientAddr.toLowerCase();
      if (patientAddr === req.user!.address.toLowerCase()) {
        throw new AppError('You cannot request access to your own records', 400);
      }
      const db = getDb();
      const result = await db.query(
        `INSERT INTO access_requests (requester_addr, patient_addr)
         VALUES ($1, $2)
         ON CONFLICT (requester_addr, patient_addr) WHERE status = 'pending' DO NOTHING
         RETURNING id, created_at`,
        [req.user!.address, patientAddr]
      );
      if (result.rows.length === 0) {
        throw new AppError('An access request is already pending', 409);
      }
      await db.query(
        `INSERT INTO notifications
          (recipient_addr, actor_addr, type, title, message, metadata)
         VALUES ($1, $2, 'access_request', 'New access request', $3, $4)`,
        [
          patientAddr,
          req.user!.address,
          `${req.user!.role.replace('_', ' ')} ${req.user!.address.slice(0, 6)}…${req.user!.address.slice(-4)} requested access to your medical history.`,
          JSON.stringify({ requestId: result.rows[0].id, requesterAddr: req.user!.address, role: req.user!.role }),
        ]
      );
      res.status(201).json({ success: true, requestId: result.rows[0].id });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/incoming', apiKeyAuth, async (req, res, next) => {
  try {
    const { rows } = await getDb().query(
      `SELECT id, requester_addr, status, created_at
       FROM access_requests
       WHERE patient_addr = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.address]
    );
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

export default router;

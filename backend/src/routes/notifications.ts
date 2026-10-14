import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { apiKeyAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.get('/', apiKeyAuth, async (req, res, next) => {
  try {
    const { rows } = await getDb().query(
      `SELECT id, type, title, message, metadata, read_at, created_at
       FROM notifications
       WHERE recipient_addr = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.address]
    );
    const unread = rows.filter((notification) => notification.read_at === null).length;
    res.json({ notifications: rows, unread });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/read',
  apiKeyAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  async (req, res, next) => {
    try {
      await getDb().query(
        `UPDATE notifications SET read_at = now()
         WHERE id = $1 AND recipient_addr = $2`,
        [req.params.id, req.user!.address]
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;

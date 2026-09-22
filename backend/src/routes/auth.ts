import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { getDb } from '../db';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import { DUAL_ROLE_ADDRESS } from '../middleware/auth';

const router = Router();
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address');
const RoleSchema = z.enum(['patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin']);

const ChallengeSchema = z.object({ address: AddressSchema });
const VerifySchema = z.object({
  address: AddressSchema,
  message: z.string().min(1).max(512),
  signature: z.string().min(1),
  role: RoleSchema,
});

router.post('/challenge', validate({ body: ChallengeSchema }), async (req, res, next) => {
  try {
    const address = req.body.address.toLowerCase();
    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const message = [
      'HealthVault wallet login',
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${expiresAt.toISOString()}`,
      'Sign this message only to authenticate this wallet. No transaction will be submitted.',
    ].join('\n');

    await getDb().query(
      'INSERT INTO auth_challenges (user_address, message, expires_at) VALUES ($1, $2, $3)',
      [address, message, expiresAt]
    );

    res.json({ message, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post('/verify', validate({ body: VerifySchema }), async (req, res, next) => {
  try {
    const { address: rawAddress, message, signature, role } = req.body;
    const address = rawAddress.toLowerCase();
    const db = getDb();
    const challenge = await db.query(
      `SELECT challenge_id FROM auth_challenges
       WHERE user_address = $1 AND message = $2 AND used_at IS NULL AND expires_at > now()`,
      [address, message]
    );

    if (challenge.rows.length === 0) {
      throw new AppError('Login challenge is invalid, expired, or already used', 401);
    }

    try {
      await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, { address });
    } catch {
      throw new AppError('Wallet signature could not be verified', 401);
    }

    await db.query('UPDATE auth_challenges SET used_at = now() WHERE challenge_id = $1', [challenge.rows[0].challenge_id]);

    const profile = await db.query('SELECT role FROM user_profiles WHERE user_address = $1', [address]);
    const isDualRoleWallet = address === DUAL_ROLE_ADDRESS;
    if (profile.rows.length === 0) {
      if (role !== 'patient' && !(isDualRoleWallet && role === 'platform_admin')) {
        throw new AppError('This wallet has no assigned staff role', 403);
      }
      await db.query('INSERT INTO user_profiles (user_address, role) VALUES ($1, $2)', [address, role]);
    } else if (
      profile.rows[0].role !== role &&
      !(isDualRoleWallet && (role === 'patient' || role === 'platform_admin'))
    ) {
      throw new AppError('The selected role is not assigned to this wallet', 403);
    }

    const token = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO sessions (user_address, token, expires_at, role) VALUES ($1, $2, $3, $4)',
      [address, token, expiresAt, role]
    );

    res.json({ token, address, role, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) await getDb().query('DELETE FROM sessions WHERE token = $1', [token]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
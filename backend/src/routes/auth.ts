import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, jwtToAddress } from '@mysten/sui/zklogin';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from '../db';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import { DUAL_ROLE_ADDRESS } from '../middleware/auth';
import { config } from '../config';
import { getSuiClient } from '../sui/client';
import { recordOffchainAuditEvent } from '../audit/offchain';

const router = Router();
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40,64}$/, 'Invalid Sui address');
const RoleSchema = z.enum(['patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin']);
const CURRENT_TERMS_VERSION = '1.0';
const CURRENT_PRIVACY_VERSION = '1.0';

const ChallengeSchema = z.object({ address: AddressSchema });
const VerifySchema = z.object({
  address: AddressSchema,
  message: z.string().min(1).max(512),
  signature: z.string().min(1),
  role: RoleSchema,
  acceptedTerms: z.boolean(),
});
const ZkLoginChallengeSchema = z.object({
  ephemeralPublicKey: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
  randomness: z.string().regex(/^\d{1,78}$/),
});
const ZkLoginVerifySchema = z.object({
  challengeId: z.string().uuid(),
  idToken: z.string().min(1),
  role: RoleSchema,
  acceptedTerms: z.boolean(),
});

const googleAuth = new OAuth2Client();

function getZkLoginSalt(issuer: string, audience: string, subject: string): string {
  const digest = crypto
    .createHmac('sha256', config.ZKLOGIN_SALT_SECRET)
    .update(`${issuer}|${audience}|${subject}`)
    .digest('hex');
  return (BigInt(`0x${digest}`) & ((1n << 248n) - 1n)).toString(10);
}

async function createSession(
  address: string,
  role: z.infer<typeof RoleSchema>,
  acceptedTerms: boolean,
  requestId?: string
) {
  const db = getDb();
  const profile = await db.query(
    `SELECT role, terms_version, privacy_version
     FROM user_profiles WHERE user_address = $1`,
    [address]
  );
  const isDualRoleWallet = address === DUAL_ROLE_ADDRESS;
  if (profile.rows.length === 0) {
    if (role !== 'patient' && !(isDualRoleWallet && (role === 'doctor' || role === 'platform_admin'))) {
      throw new AppError('This wallet has no assigned staff role', 403);
    }
    if (!acceptedTerms) {
      throw new AppError('You must accept the Terms and Conditions and Privacy Policy before continuing', 400);
    }
    await db.query(
      `INSERT INTO user_profiles
       (user_address, role, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version)
       VALUES ($1, $2, now(), $3, now(), $4)`,
      [address, role, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION]
    );
  } else if (
    profile.rows[0].role !== role &&
    !(isDualRoleWallet && (role === 'patient' || role === 'doctor' || role === 'platform_admin'))
  ) {
    throw new AppError('The selected role is not assigned to this wallet', 403);
  }
  if (profile.rows.length > 0) {
    const hasCurrentAcceptance =
      profile.rows[0].terms_version === CURRENT_TERMS_VERSION &&
      profile.rows[0].privacy_version === CURRENT_PRIVACY_VERSION;
    if (!hasCurrentAcceptance && !acceptedTerms) {
      throw new AppError('You must accept the current Terms and Conditions and Privacy Policy before continuing', 400);
    }
    if (!hasCurrentAcceptance) {
      await db.query(
        `UPDATE user_profiles
         SET terms_accepted_at = now(), terms_version = $2,
             privacy_accepted_at = now(), privacy_version = $3,
             updated_at = now()
         WHERE user_address = $1`,
        [address, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION]
      );
    }
  }

  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO sessions (user_address, token, expires_at, role) VALUES ($1, $2, $3, $4)',
    [address, token, expiresAt, role]
  );
  await recordOffchainAuditEvent({
    action: 'authentication_succeeded',
    actorAddr: address,
    actorRole: role,
    targetType: 'session',
    result: 'success',
    metadata: { method: 'zklogin', termsVersion: CURRENT_TERMS_VERSION },
    requestId,
  });
  return { token, address, role, expiresAt: expiresAt.toISOString(), termsAccepted: true };
}

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

router.post('/zklogin/challenge', validate({ body: ZkLoginChallengeSchema }), async (req, res, next) => {
  try {
    if (!config.GOOGLE_CLIENT_ID || !config.ZKLOGIN_SALT_SECRET) {
      throw new AppError('Google zkLogin is not configured on this server', 503);
    }
    const { ephemeralPublicKey, randomness } = req.body;
    const publicKeyBytes = Buffer.from(ephemeralPublicKey, 'base64');
    if (publicKeyBytes.length !== 32) throw new AppError('Invalid ephemeral public key', 400);

    const systemState = await getSuiClient().core.getCurrentSystemState();
    const maxEpoch = Number(systemState.systemState.epoch) + 2;

    const nonce = generateNonce(
      new Ed25519PublicKey(publicKeyBytes),
      maxEpoch,
      BigInt(randomness)
    );
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await getDb().query(
      `INSERT INTO zklogin_challenges (challenge_id, nonce, expires_at)
       VALUES ($1, $2, $3)`,
      [challengeId, nonce, expiresAt]
    );
    res.json({ challengeId, nonce, maxEpoch, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post('/zklogin/verify', validate({ body: ZkLoginVerifySchema }), async (req, res, next) => {
  let attemptedAddress: string | null = null;
  try {
    if (!config.GOOGLE_CLIENT_ID || !config.ZKLOGIN_SALT_SECRET) {
      throw new AppError('Google zkLogin is not configured on this server', 503);
    }
    const { challengeId, idToken, role, acceptedTerms } = req.body;
    let payload;
    try {
      const ticket = await googleAuth.verifyIdToken({
        idToken,
        audience: config.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError('Google ID token could not be verified', 401);
    }
    if (
      !payload?.sub ||
      !payload.iss ||
      !payload.aud ||
      !payload.nonce ||
      payload.email_verified !== true
    ) {
      throw new AppError('Google ID token is missing required verified claims', 401);
    }

    const db = getDb();
    const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const salt = getZkLoginSalt(payload.iss, audience, payload.sub);
    const address = jwtToAddress(idToken, salt, false).toLowerCase();
    attemptedAddress = address;
    const existingProfile = await db.query(
      `SELECT terms_version, privacy_version
       FROM user_profiles WHERE user_address = $1`,
      [address]
    );
    const hasCurrentAcceptance =
      existingProfile.rows[0]?.terms_version === CURRENT_TERMS_VERSION &&
      existingProfile.rows[0]?.privacy_version === CURRENT_PRIVACY_VERSION;
    if (!hasCurrentAcceptance && !acceptedTerms) {
      throw new AppError('You must accept the current Terms and Conditions and Privacy Policy before continuing', 400);
    }
    const consumedChallenge = await db.query(
      `UPDATE zklogin_challenges SET used_at = now()
       WHERE challenge_id = $1 AND nonce = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING challenge_id`,
      [challengeId, payload.nonce]
    );
    if (consumedChallenge.rows.length === 0) {
      throw new AppError('zkLogin challenge is invalid, expired, or already used', 401);
    }
    const session = await createSession(address, role, acceptedTerms, req.requestId);
    res.json(session);
  } catch (err) {
    await recordOffchainAuditEvent({
      action: 'authentication_failed',
      actorAddr: attemptedAddress,
      actorRole: req.body?.role,
      targetType: 'session',
      result: 'failure',
      metadata: { method: 'zklogin', reasonCode: err instanceof AppError ? err.statusCode : 500 },
      requestId: req.requestId,
    }).catch(() => undefined);
    next(err);
  }
});

router.post('/verify', validate({ body: VerifySchema }), async (req, res, next) => {
  try {
    const { address: rawAddress, message, signature, role, acceptedTerms } = req.body;
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

    const profile = await db.query(
      `SELECT role, terms_version, privacy_version
       FROM user_profiles WHERE user_address = $1`,
      [address]
    );
    const isDualRoleWallet = address === DUAL_ROLE_ADDRESS;
    if (profile.rows.length === 0) {
      if (role !== 'patient' && !(isDualRoleWallet && (role === 'doctor' || role === 'platform_admin'))) {
        throw new AppError('This wallet has no assigned staff role', 403);
      }
      if (!acceptedTerms) {
        throw new AppError('You must accept the Terms and Conditions and Privacy Policy before continuing', 400);
      }
      await db.query(
        `INSERT INTO user_profiles
         (user_address, role, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version)
         VALUES ($1, $2, now(), $3, now(), $4)`,
        [address, role, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION]
      );
    } else if (
      profile.rows[0].role !== role &&
      !(isDualRoleWallet && (role === 'patient' || role === 'doctor' || role === 'platform_admin'))
    ) {
      throw new AppError('The selected role is not assigned to this wallet', 403);
    }
    const hasCurrentAcceptance =
      profile.rows.length > 0 &&
      profile.rows[0].terms_version === CURRENT_TERMS_VERSION &&
      profile.rows[0].privacy_version === CURRENT_PRIVACY_VERSION;
    if (profile.rows.length > 0 && !hasCurrentAcceptance) {
      if (!acceptedTerms) {
        throw new AppError('You must accept the current Terms and Conditions and Privacy Policy before continuing', 400);
      }
      await db.query(
        `UPDATE user_profiles
         SET terms_accepted_at = now(), terms_version = $2,
             privacy_accepted_at = now(), privacy_version = $3,
             updated_at = now()
         WHERE user_address = $1`,
        [address, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION]
      );
    }
    await db.query('UPDATE auth_challenges SET used_at = now() WHERE challenge_id = $1', [challenge.rows[0].challenge_id]);

    const token = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO sessions (user_address, token, expires_at, role) VALUES ($1, $2, $3, $4)',
      [address, token, expiresAt, role]
    );

    await recordOffchainAuditEvent({
      action: 'authentication_succeeded',
      actorAddr: address,
      actorRole: role,
      targetType: 'session',
      result: 'success',
      metadata: { method: 'wallet_signature' },
      requestId: req.requestId,
    });

    res.json({ token, address, role, expiresAt: expiresAt.toISOString(), termsAccepted: true });
  } catch (err) {
    const candidateAddress = req.body?.address;
    await recordOffchainAuditEvent({
      action: 'authentication_failed',
      actorAddr: typeof candidateAddress === 'string' && /^0x[0-9a-fA-F]{40,64}$/.test(candidateAddress)
        ? candidateAddress
        : null,
      actorRole: req.body?.role,
      targetType: 'session',
      result: 'failure',
      metadata: { method: 'wallet_signature', reasonCode: err instanceof AppError ? err.statusCode : 500 },
      requestId: req.requestId,
    }).catch(() => undefined);
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      const db = getDb();
      const { rows } = await db.query(
        'SELECT user_address, role FROM sessions WHERE token = $1',
        [token]
      );
      if (rows[0]) {
        await recordOffchainAuditEvent({
          action: 'session_ended',
          actorAddr: rows[0].user_address,
          actorRole: rows[0].role,
          targetType: 'session',
          result: 'success',
          requestId: req.requestId,
        });
      }
      await db.query('DELETE FROM sessions WHERE token = $1', [token]);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
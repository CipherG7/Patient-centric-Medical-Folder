/** Session authentication backed by a verified wallet signature. */

import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../db';
import { AppError } from './errorHandler';

export type UserRole = 'patient' | 'doctor' | 'lab_tech' | 'pharmacist' | 'hospital_admin' | 'platform_admin';

// This deployment wallet is allowed to use both the patient and platform-admin workspaces.
export const DUAL_ROLE_ADDRESS = '0xe148af1066ce54c8cb9e4e6c3b4d57596d677c9060ab562f13dbb36b575675cf';

/**
 * Extend Express Request to include authenticated user info.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        address: string;
        role: UserRole;
      };
    }
  }
}

/** Resolve the bearer token to a non-expired, database-backed wallet session. */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'A valid wallet session is required.',
    });
    return;
  }

  const { rows } = await getDb().query(
    `SELECT s.user_address, COALESCE(s.role, p.role) AS role FROM sessions s
     JOIN user_profiles p ON p.user_address = s.user_address
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  if (rows.length === 0) {
    res.status(401).json({ error: 'Unauthorized', message: 'Session is invalid or expired.' });
    return;
  }

  req.user = { address: rows[0].user_address, role: rows[0].role };

  next();
}

/** Attach a valid session when present without requiring one. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  const { rows } = await getDb().query(
    `SELECT s.user_address, COALESCE(s.role, p.role) AS role FROM sessions s
     JOIN user_profiles p ON p.user_address = s.user_address
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  if (rows.length > 0) req.user = { address: rows[0].user_address, role: rows[0].role };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden', message: 'Your assigned role cannot perform this action.' });
      return;
    }
    next();
  };
}

export function requireUserAddress(address: string, req: Request): void {
  if (!req.user || req.user.address.toLowerCase() !== address.toLowerCase()) {
    throw new AppError('The requested wallet address does not belong to the authenticated user', 403);
  }
}


/**
 * Authentication middleware.
 *
 * For this demo we use a simple API key passed in the `x-api-key` header.
 * In production this would be replaced with JWT-based session tokens or
 * OAuth2, and the wallet address would be extracted from the signed
 * message (using Sui Wallet's personal_sign / signMessage).
 */

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Extend Express Request to include authenticated user info.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        address: string;
        role: 'patient' | 'doctor' | 'admin';
      };
    }
  }
}

/**
 * Demo API key authentication.
 * Checks `x-api-key` header against configured key.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey || apiKey !== config.API_KEY) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid x-api-key header is required.',
    });
    return;
  }

  // In a real system, we'd look up the user from the DB here.
  // For the demo, attach a generic admin user.
  req.user = {
    address: '0x0', // Will be overridden per-request in production
    role: 'admin',
  };

  next();
}

/**
 * Optional auth — attaches user info if a valid API key is provided,
 * but does not reject unauthenticated requests.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (apiKey && apiKey === config.API_KEY) {
    req.user = {
      address: '0x0',
      role: 'admin',
    };
  }

  next();
}


/**
 * Global error handling middleware.
 * Catches all unhandled errors and returns a consistent JSON response.
 */

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Custom application error with HTTP status code.
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Central error handler middleware.
 */
export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  // Log the error
  console.error(`[Error] ${statusCode} - ${message}`);
  if (config.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: message,
    ...(config.NODE_ENV === 'development' && { stack: err.stack }),
  });
}


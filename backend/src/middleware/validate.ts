/**
 * Request validation middleware using Zod schemas.
 * Validates `req.body`, `req.params`, and `req.query` against
 * provided schemas before passing to the route handler.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Middleware factory that validates request parts against Zod schemas.
 *
 * Usage:
 * ```
 * router.post('/endpoint',
 *   validate({ body: myBodySchema, params: myParamsSchema }),
 *   handler
 * );
 * ```
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Validation Error',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}


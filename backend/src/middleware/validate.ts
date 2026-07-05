import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodType } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Generic Zod validation middleware.
 *
 * Validates req[target] against the given schema. On failure the ZodError is
 * passed to the central error handler (errorHandler.ts), which returns a 400
 * with validation details. On success the parsed (and possibly transformed /
 * defaulted) data replaces the original input, so route handlers can rely on
 * a validated req.body / req.query / req.params.
 *
 * Usage:
 *   router.post('/', authenticateToken, validate(createEventSchema), handler);
 *   router.get('/', validate(listQuerySchema, 'query'), handler);
 */
export function validate(schema: ZodType, target: ValidationTarget = 'body'): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req[target]);

        if (!result.success) {
            // Handled centrally by errorHandler.ts (ZodError -> 400 + details)
            next(result.error);
            return;
        }

        if (target === 'body') {
            req.body = result.data;
        } else {
            // req.query and req.params can be getter-only in newer Express
            // versions; mutate the existing object instead of reassigning.
            Object.assign(req[target], result.data);
        }

        next();
    };
}

export default validate;

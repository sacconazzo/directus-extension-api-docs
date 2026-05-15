import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny, ZodIssue } from 'zod';

export type ZodValidatorTargets = {
    params?: ZodTypeAny;
    query?: ZodTypeAny;
    body?: ZodTypeAny;
};

type Source = 'params' | 'query' | 'body';
const SOURCES: readonly Source[] = ['params', 'query', 'body'];

const formatIssues = (source: Source, issues: ZodIssue[]) =>
    issues.map(issue => ({
        path: ['', source, ...issue.path.map(String)].join('/'),
        message: issue.message,
        code: issue.code,
    }));

/**
 * Express middleware that runs Zod's `safeParse` over `req.params`,
 * `req.query` and `req.body` (in that order). On the first failing slot it
 * responds with HTTP 400 and an envelope matching the shape produced by
 * `express-openapi-validator`, so existing API consumers don't need to
 * change. On success the parsed (and possibly coerced) value replaces the
 * original on the request, giving handlers a typed payload.
 */
export function zodValidator(targets: ZodValidatorTargets): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        for (const source of SOURCES) {
            const schema = targets[source];
            if (!schema) continue;
            const result = schema.safeParse((req as unknown as Record<Source, unknown>)[source]);
            if (!result.success) {
                const errors = formatIssues(source, result.error.issues);
                const head = errors[0];
                res.status(400).json({
                    message: head ? `request/${source} ${head.message}` : `request/${source} validation failed`,
                    errors,
                });
                return;
            }
            (req as unknown as Record<Source, unknown>)[source] = result.data;
        }
        next();
    };
}

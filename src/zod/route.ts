import type { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { registry } from './registry';
import { zodValidator } from './validate';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type ResponseDef = {
    description: string;
    schema?: ZodTypeAny;
};

type ParamsOf<T> = T extends ZodTypeAny ? z.infer<T> & Record<string, string> : Record<string, string>;
type InferOrAny<T> = T extends ZodTypeAny ? z.infer<T> : any;

export type RouteConfig<P extends ZodTypeAny | undefined = undefined, Q extends ZodTypeAny | undefined = undefined, B extends ZodTypeAny | undefined = undefined> = {
    method: HttpMethod;
    path: string;
    /**
     * URL prefix prepended to `path` in the generated OpenAPI spec only.
     * Directus mounts each endpoint extension under `/{extension-id}`, so
     * the Express router doesn't see that segment — pass it here (e.g.
     * `prefix: '/my-extension'`) and `/api-docs/oas` will show the full
     * URL clients actually call. Defaults to '' (no prefix).
     */
    prefix?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    security?: Array<Record<string, string[]>>;
    request?: { params?: P; query?: Q; body?: B };
    responses: Record<number, ResponseDef>;
    handler: (req: Request<ParamsOf<P>, any, InferOrAny<B>, InferOrAny<Q>>, res: Response, next: NextFunction) => void;
};

const expressToOpenApiPath = (path: string) => path.replace(/:([^/?]+)\??/g, '{$1}');

/**
 * Declare a route once and obtain three things at no extra cost:
 *
 *   1. an entry under `registry.definitions` so the operation surfaces in
 *      the merged OpenAPI document at `/api-docs/oas`;
 *   2. a per-route Zod validation middleware producing
 *      `express-openapi-validator`-shaped errors on failure;
 *   3. a typed handler where `req.params`, `req.query` and `req.body`
 *      are inferred from the schemas (or `undefined` when omitted).
 */
export function defineRoute<P extends ZodTypeAny | undefined = undefined, Q extends ZodTypeAny | undefined = undefined, B extends ZodTypeAny | undefined = undefined>(
    router: Router,
    config: RouteConfig<P, Q, B>,
): void {
    const request: Record<string, unknown> = {};
    if (config.request?.params) request.params = config.request.params;
    if (config.request?.query) request.query = config.request.query;
    if (config.request?.body) {
        request.body = {
            required: true,
            content: { 'application/json': { schema: config.request.body } },
        };
    }

    const responses: Record<string, unknown> = {};
    for (const [status, response] of Object.entries(config.responses)) {
        responses[status] = response.schema
            ? {
                  description: response.description,
                  content: { 'application/json': { schema: response.schema } },
              }
            : { description: response.description };
    }

    registry.registerPath({
        method: config.method,
        path: (config.prefix ?? '') + expressToOpenApiPath(config.path),
        summary: config.summary,
        description: config.description,
        tags: config.tags,
        deprecated: config.deprecated,
        security: config.security,
        request: Object.keys(request).length > 0 ? (request as never) : undefined,
        responses: responses as never,
    });

    const validator = zodValidator({
        params: config.request?.params,
        query: config.request?.query,
        body: config.request?.body,
    });

    const handler = config.handler as unknown as (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
    const wrapped: RequestHandler = (req, res, next) => {
        Promise.resolve()
            .then(() => handler(req, res, next))
            .catch(next);
    };

    (router[config.method] as (path: string, ...handlers: RequestHandler[]) => Router).call(router, config.path, validator, wrapped);
}

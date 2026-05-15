import type { Router, Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { defineRoute, RouteConfig } from './route';

/**
 * The context Directus passes to the handler of an endpoint extension —
 * `services`, `getSchema`, `logger`, `env`, `database`, `emitter`. Loosely
 * typed because the exact shape varies across Directus versions and we
 * don't want to chase it.
 */
export type EndpointContext = {
    services: any;
    getSchema: () => Promise<any>;
    logger?: any;
    env?: any;
    database?: any;
    emitter?: any;
    [key: string]: any;
};

/**
 * The `route` helper passed into the setup callback of `defineEndpoint`.
 * Same generics as `defineRoute` so `req.params/query/body` stay typed
 * from the Zod schemas declared on each route.
 */
export type RouteHelper = <P extends ZodTypeAny | undefined = undefined, Q extends ZodTypeAny | undefined = undefined, B extends ZodTypeAny | undefined = undefined>(
    config: RouteConfig<P, Q, B>,
) => void;

export type EndpointSetup = (route: RouteHelper, ctx: EndpointContext) => void;

/**
 * Declarative wrapper for a Directus endpoint extension that uses the
 * Zod pipeline. Replaces the boilerplate:
 *
 *     const { defineEndpoint } = require('@directus/extensions-sdk');
 *     const { defineRoute } = require('directus-extension-api-docs');
 *     module.exports = {
 *         id: 'foo',
 *         handler: defineEndpoint((router, ctx) => {
 *             defineRoute(router, { ..., prefix: '/foo', handler: ... });
 *         }),
 *     };
 *
 * with:
 *
 *     const { defineEndpoint } = require('directus-extension-api-docs');
 *     module.exports = defineEndpoint('foo', (route, { services, getSchema }) => {
 *         route({ method, path, request, responses, handler });
 *     });
 *
 * - The OpenAPI prefix defaults to `/<id>` so paths in `/api-docs/oas`
 *   match the URL clients actually call.
 * - `services`, `getSchema`, `logger`, ... are available in the setup
 *   closure and naturally accessible from each handler.
 * - Per-route Zod validation, error envelope, OpenAPI fragment and typed
 *   `req.params/query/body` continue to work exactly as in `defineRoute`.
 */
export function defineEndpoint(id: string, setup: EndpointSetup): { id: string; handler: (router: Router, ctx: EndpointContext) => void } {
    // Normalise so '/foo' and 'foo' both yield prefix '/foo' (avoid '//foo').
    const prefix = '/' + id.replace(/^\/+|\/+$/g, '');
    return {
        id,
        handler: (router: Router, ctx: EndpointContext) => {
            const route: RouteHelper = config => {
                defineRoute(router, { ...config, prefix: config.prefix ?? prefix } as Parameters<typeof defineRoute>[1]);
            };
            setup(route, ctx);
        },
    };
}

// Re-export for the sake of the type-test fixtures.
export type { Router, Request, Response, NextFunction };

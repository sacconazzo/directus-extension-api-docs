// Zod pipeline demo: declare schema + handler together. The OpenAPI fragment
// is built from the schemas and merged into /api-docs/oas; validation runs
// automatically before the handler. Note the single import — defineEndpoint
// from this package wraps Directus's own SDK helper for us.
const { z, defineEndpoint, registerSchema } = require('directus-extension-api-docs');

// --- shared schemas (registered → become $ref components.schemas.*) ---
const Greeting = registerSchema(
    'Greeting',
    z.object({
        name: z.string().min(1).openapi({ example: 'alice' }),
    }),
);

const User = registerSchema(
    'User',
    z.object({
        id: z.string().uuid(),
        email: z.string().email().openapi({ example: 'alice@example.com' }),
        first_name: z.string().nullable(),
    }),
);

const ApiError = registerSchema(
    'ApiError',
    z.object({
        message: z.string(),
        code: z.string().optional(),
    }),
);

// Discriminated union (oneOf in OpenAPI, dropdown in Swagger try-it-out).
const Event = registerSchema(
    'Event',
    z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('order'), orderId: z.string().uuid(), total: z.number().positive() }),
        z.object({ kind: z.literal('refund'), refundId: z.string().uuid(), reason: z.string().min(1) }),
    ]),
);

const HelloResponse = z.object({ message: z.string(), length: z.number().int() });
const ItemList = z.array(z.object({ id: z.number() }));

const KNOWN = new Set(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']);

// `defineEndpoint(id, setup)` returns the `{ id, handler }` shape Directus expects.
// The setup callback receives a `route()` helper (already bound to the router and
// with `prefix: '/zod-demo'` applied automatically) plus the Directus context.
module.exports = defineEndpoint('zod-demo', (route) => {
    // POST /zod-demo/hello — body validation, typed req.body, response schema.
    route({
        method: 'post',
        path: '/hello',
        tags: ['ZodDemo'],
        summary: 'Greet a user (validated by Zod)',
        request: { body: Greeting },
        responses: {
            200: { description: 'OK', schema: HelloResponse },
            400: { description: 'Validation failed', schema: ApiError },
        },
        handler: (req, res) => {
            const { name } = req.body;
            res.json({ message: `Hello, ${name}!`, length: name.length });
        },
    });

    // GET /zod-demo/items?limit=N — coerces query string into number, default, max.
    route({
        method: 'get',
        path: '/items',
        tags: ['ZodDemo'],
        summary: 'List items (query coercion demo)',
        request: {
            query: z.object({
                limit: z.coerce.number().int().positive().max(100).default(10),
            }),
        },
        responses: {
            200: { description: 'OK', schema: ItemList },
            400: { description: 'Invalid query', schema: ApiError },
        },
        handler: (req, res) => {
            const items = Array.from({ length: req.query.limit }, (_v, i) => ({ id: i + 1 }));
            res.json(items);
        },
    });

    // PUT /zod-demo/users/:id — combo path param (UUID) + body, multi-status.
    route({
        method: 'put',
        path: '/users/:id',
        tags: ['ZodDemo'],
        summary: 'Update a user (params + body + multi-status)',
        request: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({
                email: z.string().email().optional(),
                first_name: z.string().min(1).nullable().optional(),
            }),
        },
        responses: {
            200: { description: 'Updated', schema: User },
            404: { description: 'Not found', schema: ApiError },
        },
        handler: (req, res) => {
            if (!KNOWN.has(req.params.id)) {
                return res.status(404).json({ message: 'user not found', code: 'NOT_FOUND' });
            }
            res.json({ id: req.params.id, email: req.body.email ?? 'alice@example.com', first_name: req.body.first_name ?? null });
        },
    });

    // DELETE /zod-demo/items/:id — DELETE verb, 204 No Content.
    route({
        method: 'delete',
        path: '/items/:id',
        tags: ['ZodDemo'],
        summary: 'Delete an item (DELETE verb)',
        request: { params: z.object({ id: z.string().uuid() }) },
        responses: {
            204: { description: 'Gone' },
            404: { description: 'Not found', schema: ApiError },
        },
        handler: (req, res) => {
            if (!KNOWN.has(req.params.id)) {
                return res.status(404).json({ message: 'item not found' });
            }
            res.status(204).end();
        },
    });

    // POST /zod-demo/event — discriminatedUnion: Swagger shows a oneOf dropdown.
    route({
        method: 'post',
        path: '/event',
        tags: ['ZodDemo'],
        summary: 'Record an event (discriminatedUnion body)',
        request: { body: Event },
        responses: {
            202: { description: 'Accepted' },
            400: { description: 'Validation failed', schema: ApiError },
        },
        handler: (req, res) => {
            // req.body is narrowed by `kind`
            if (req.body.kind === 'order') return res.status(202).json({ recorded: 'order', orderId: req.body.orderId });
            return res.status(202).json({ recorded: 'refund', refundId: req.body.refundId, reason: req.body.reason });
        },
    });

    // GET /zod-demo/secure — security: [{ Auth: [] }] → padlock icon in Swagger.
    // Note: the playground runs with useAuthentication=false, so requests
    // aren't actually rejected; this only exercises the OAS rendering.
    route({
        method: 'get',
        path: '/secure',
        tags: ['ZodDemo'],
        summary: 'Secured operation (lock icon)',
        security: [{ Auth: [] }],
        responses: { 200: { description: 'OK' } },
        handler: (_req, res) => res.json({ secured: true }),
    });

    // GET /zod-demo/old-thing — deprecated: true → strike-through in Swagger.
    route({
        method: 'get',
        path: '/old-thing',
        tags: ['ZodDemo'],
        summary: 'Deprecated endpoint',
        deprecated: true,
        responses: { 200: { description: 'Still works, will be removed' } },
        handler: (_req, res) => res.json({ legacy: true }),
    });

    // POST /zod-demo/boom — handler that throws; verifies async error
    // forwarding to next(err). Directus's default error handler returns 500.
    route({
        method: 'post',
        path: '/boom',
        tags: ['ZodDemo'],
        summary: 'Throwing handler (error forwarding demo)',
        request: { body: z.object({ when: z.enum(['sync', 'async']).default('async') }) },
        responses: {
            500: { description: 'Server error', schema: ApiError },
        },
        handler: async (req) => {
            if (req.body.when === 'sync') {
                throw new Error('sync kaboom');
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
            throw new Error('async kaboom');
        },
    });
});

// Zod pipeline demo: declare schema + handler together. The OpenAPI fragment
// is built from the schemas and merged into /api-docs/oas; validation runs
// automatically before the handler.
const { z, defineRoute, registerSchema } = require('directus-extension-api-docs');

const PREFIX = '/zod-demo'; // matches the extension `id` below

const Greeting = registerSchema(
    'Greeting',
    z.object({
        name: z.string().min(1).openapi({ example: 'alice' }),
    }),
);

const HelloResponse = z.object({
    message: z.string(),
    length: z.number().int(),
});

module.exports = {
    id: 'zod-demo',
    handler: (router) => {
        // POST /zod-demo/hello — validates body, types req.body, documents the response shape.
        defineRoute(router, {
            method: 'post',
            path: '/hello',
            prefix: PREFIX,
            tags: ['ZodDemo'],
            summary: 'Greet a user (validated by Zod)',
            request: { body: Greeting },
            responses: {
                200: { description: 'OK', schema: HelloResponse },
                400: { description: 'Validation failed' },
            },
            handler: (req, res) => {
                const { name } = req.body;
                res.json({ message: `Hello, ${name}!`, length: name.length });
            },
        });

        // GET /zod-demo/items?limit=5 — coerces the query string into a number.
        defineRoute(router, {
            method: 'get',
            path: '/items',
            prefix: PREFIX,
            tags: ['ZodDemo'],
            summary: 'List items (query coercion demo)',
            request: {
                query: z.object({
                    limit: z.coerce.number().int().positive().max(100).default(10),
                }),
            },
            responses: {
                200: { description: 'OK', schema: z.array(z.object({ id: z.number() })) },
            },
            handler: (req, res) => {
                const items = Array.from({ length: req.query.limit }, (_v, i) => ({ id: i + 1 }));
                res.json(items);
            },
        });
    },
};

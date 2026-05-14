// Real-world Directus integration: use defineRoute together with the
// services Directus injects into the endpoint context (UsersService,
// ItemsService, etc). Hits the SQLite DB inside the playground container.
const { z, defineRoute, registerSchema } = require('directus-extension-api-docs');

const PREFIX = '/directus-services-demo'; // matches the extension `id` below

const DirectusUser = registerSchema(
    'DirectusUser',
    z.object({
        id: z.string().uuid(),
        email: z.string().email().nullable(),
        first_name: z.string().nullable(),
        last_name: z.string().nullable(),
        status: z.string(),
    }),
);

module.exports = {
    id: 'directus-services-demo',
    handler: (router, { services, getSchema, logger }) => {
        // GET /directus-services-demo/users?limit=N&search=foo
        // Returns rows straight from `directus_users` via UsersService.
        defineRoute(router, {
            method: 'get',
            path: '/users',
            prefix: PREFIX,
            tags: ['DirectusServices'],
            summary: 'List Directus users (real DB via UsersService)',
            request: {
                query: z.object({
                    limit: z.coerce.number().int().positive().max(100).default(10),
                    search: z.string().optional(),
                }),
            },
            responses: {
                200: { description: 'OK', schema: z.array(DirectusUser) },
                500: { description: 'Server error' },
            },
            handler: async (req, res, next) => {
                try {
                    const { UsersService } = services;
                    const schema = await getSchema();
                    // Use an admin accountability here for the demo so the
                    // demo route can read users regardless of who's calling.
                    const usersService = new UsersService({ schema, accountability: { admin: true } });
                    const users = await usersService.readByQuery({
                        limit: req.query.limit,
                        fields: ['id', 'email', 'first_name', 'last_name', 'status'],
                        search: req.query.search,
                    });
                    res.json(users);
                } catch (err) {
                    logger?.error?.(err);
                    next(err);
                }
            },
        });

        // GET /directus-services-demo/users/:id — read a single user with
        // ServerError if the id format is wrong (caught by Zod 400 before).
        defineRoute(router, {
            method: 'get',
            path: '/users/:id',
            prefix: PREFIX,
            tags: ['DirectusServices'],
            summary: 'Read one Directus user by id',
            request: { params: z.object({ id: z.string().uuid() }) },
            responses: {
                200: { description: 'OK', schema: DirectusUser },
                404: { description: 'Not found' },
            },
            handler: async (req, res, next) => {
                try {
                    const { UsersService } = services;
                    const schema = await getSchema();
                    const usersService = new UsersService({ schema, accountability: { admin: true } });
                    const user = await usersService.readOne(req.params.id, {
                        fields: ['id', 'email', 'first_name', 'last_name', 'status'],
                    });
                    res.json(user);
                } catch (err) {
                    // Directus throws ForbiddenError for missing rows; surface as 404.
                    if (err && err.code === 'FORBIDDEN') {
                        return res.status(404).json({ message: 'user not found' });
                    }
                    next(err);
                }
            },
        });
    },
};

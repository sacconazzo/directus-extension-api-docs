import express from 'express';
import request from 'supertest';
import { z, defineRoute, registerSchema, registry, _resetRegistry } from '../../src/zod';

const noopHandler = (_req: express.Request, res: express.Response) => res.status(204).end();

type RouteDef = { type: 'route'; route: { method: string; path: string; tags?: string[]; summary?: string; description?: string; deprecated?: boolean; security?: unknown; request?: unknown } };

const findRoute = (method: string, path: string): RouteDef | undefined => {
    const found = registry.definitions.find(d => {
        const r = d as RouteDef;
        return r.type === 'route' && r.route?.method === method && r.route?.path === path;
    });
    return found as unknown as RouteDef | undefined;
};

describe('defineRoute — registry side-effects', () => {
    beforeEach(() => _resetRegistry());

    test.each([
        ['get', 'GET /things/:id', '/things/{id}'],
        ['post', 'POST /things', '/things'],
        ['put', 'PUT /things/:id', '/things/{id}'],
        ['patch', 'PATCH /things/:id', '/things/{id}'],
        ['delete', 'DELETE /things/:id', '/things/{id}'],
    ] as const)('registers a %s operation translating Express params to OpenAPI', (method, _label, openapiPath) => {
        const router = express.Router();
        defineRoute(router, {
            method,
            path: method === 'post' ? '/things' : '/things/:id',
            request: method === 'post' ? undefined : { params: z.object({ id: z.string() }) },
            responses: { 200: { description: 'OK' } },
            handler: noopHandler,
        });
        const found = findRoute(method, openapiPath);
        expect(found).toBeDefined();
    });

    test('records summary, description, tags, deprecated and security as supplied', () => {
        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/x',
            summary: 'Sum',
            description: 'Desc',
            tags: ['T1', 'T2'],
            deprecated: true,
            security: [{ Auth: [] }],
            responses: { 200: { description: 'OK' } },
            handler: noopHandler,
        });
        const route = findRoute('get', '/x');
        expect(route?.route.summary).toBe('Sum');
        expect(route?.route.description).toBe('Desc');
        expect(route?.route.tags).toEqual(['T1', 'T2']);
        expect(route?.route.deprecated).toBe(true);
        expect(route?.route.security).toEqual([{ Auth: [] }]);
    });

    test('prepends `prefix` to the OpenAPI path while leaving the router path untouched', () => {
        const router = express.Router();
        const postSpy = jest.spyOn(router, 'post');
        defineRoute(router, {
            method: 'post',
            path: '/echo',
            prefix: '/my-extension',
            request: { body: z.object({ x: z.string() }) },
            responses: { 200: { description: 'OK' } },
            handler: noopHandler,
        });
        // OAS sees the absolute path that clients actually call:
        expect(findRoute('post', '/my-extension/echo')).toBeDefined();
        // Express router is still mounted at the relative path:
        expect(postSpy).toHaveBeenCalledWith('/echo', expect.any(Function), expect.any(Function));
    });

    test('omits the prefix when it is not supplied (back-compat default)', () => {
        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/no-prefix',
            responses: { 200: { description: 'OK' } },
            handler: noopHandler,
        });
        expect(findRoute('get', '/no-prefix')).toBeDefined();
    });

    test('translates optional and multiple Express params to OpenAPI braces', () => {
        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/a/:foo/:bar?',
            request: { params: z.object({ foo: z.string(), bar: z.string().optional() }) },
            responses: { 200: { description: 'OK' } },
            handler: noopHandler,
        });
        expect(findRoute('get', '/a/{foo}/{bar}')).toBeDefined();
    });

    test('omits the `request` block in the registry when no request schemas are configured', () => {
        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/empty',
            responses: { 200: { description: 'OK' } },
            handler: noopHandler,
        });
        const def = findRoute('get', '/empty');
        expect(def?.route.request).toBeUndefined();
    });
});

describe('defineRoute — runtime behaviour', () => {
    beforeEach(() => _resetRegistry());

    const buildApp = (build: (router: express.Router) => void) => {
        const app = express();
        app.use(express.json());
        const router = express.Router();
        build(router);
        app.use(router);
        app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            res.status(500).json({ message: err.message });
        });
        return app;
    };

    test.each(['get', 'post', 'put', 'patch', 'delete'] as const)('routes %s requests to the right handler', async method => {
        const handlerSpy = jest.fn();
        const app = buildApp(router => {
            defineRoute(router, {
                method,
                path: '/things/:id',
                request: { params: z.object({ id: z.string() }) },
                responses: { 204: { description: 'No content' } },
                handler: (req, res) => {
                    handlerSpy(req, res);
                    res.status(204).end();
                },
            });
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (request(app) as any)[method]('/things/abc');
        expect(r.status).toBe(204);
        expect(handlerSpy).toHaveBeenCalledTimes(1);
    });

    test('runs the validator before the handler and rejects invalid bodies', async () => {
        const handlerSpy = jest.fn();
        const app = buildApp(router => {
            defineRoute(router, {
                method: 'post',
                path: '/echo',
                request: { body: z.object({ text: z.string().min(1) }) },
                responses: { 204: { description: 'No content' } },
                handler: (req, res) => {
                    handlerSpy(req, res);
                    res.status(204).end();
                },
            });
        });

        const ko = await request(app).post('/echo').send({ text: '' });
        expect(ko.status).toBe(400);
        expect(ko.body.errors[0].path).toBe('/body/text');
        expect(ko.body.errors[0].code).toBe('too_small');
        expect(handlerSpy).not.toHaveBeenCalled();

        const ok = await request(app).post('/echo').send({ text: 'hello' });
        expect(ok.status).toBe(204);
        expect(handlerSpy).toHaveBeenCalledTimes(1);
    });

    test('typed handler receives parsed (and coerced) values', async () => {
        const app = buildApp(router => {
            defineRoute(router, {
                method: 'get',
                path: '/items',
                request: { query: z.object({ limit: z.coerce.number().int().positive() }) },
                responses: { 200: { description: 'OK' } },
                handler: (req, res) => res.json({ limit: req.query.limit, type: typeof req.query.limit }),
            });
        });
        const ok = await request(app).get('/items?limit=10');
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ limit: 10, type: 'number' });
    });

    test('forwards async handler errors to next(err)', async () => {
        const app = buildApp(router => {
            defineRoute(router, {
                method: 'get',
                path: '/boom',
                responses: { 500: { description: 'Server Error' } },
                handler: async () => {
                    throw new Error('kaboom');
                },
            });
        });
        const r = await request(app).get('/boom');
        expect(r.status).toBe(500);
        expect(r.body.message).toBe('kaboom');
    });

    test('forwards synchronous handler errors to next(err)', async () => {
        const app = buildApp(router => {
            defineRoute(router, {
                method: 'get',
                path: '/sync-boom',
                responses: { 500: { description: 'Server Error' } },
                handler: () => {
                    throw new Error('sync kaboom');
                },
            });
        });
        const r = await request(app).get('/sync-boom');
        expect(r.status).toBe(500);
        expect(r.body.message).toBe('sync kaboom');
    });

    test('rejects requests on the wrong HTTP verb with 404', async () => {
        const app = buildApp(router => {
            defineRoute(router, {
                method: 'delete',
                path: '/things/:id',
                request: { params: z.object({ id: z.string() }) },
                responses: { 204: { description: 'Gone' } },
                handler: (_req, res) => res.status(204).end(),
            });
        });
        expect((await request(app).get('/things/abc')).status).toBe(404);
        expect((await request(app).delete('/things/abc')).status).toBe(204);
    });

    test('combines params, query and body validation correctly on the same route', async () => {
        const app = buildApp(router => {
            const Body = registerSchema('Combined', z.object({ note: z.string().min(1) }));
            defineRoute(router, {
                method: 'put',
                path: '/users/:id',
                request: {
                    params: z.object({ id: z.string().uuid() }),
                    query: z.object({ verbose: z.coerce.boolean().optional() }),
                    body: Body,
                },
                responses: { 200: { description: 'OK' } },
                handler: (req, res) => res.json({ id: req.params.id, verbose: req.query.verbose ?? false, note: req.body.note }),
            });
        });
        const ok = await request(app).put('/users/00000000-0000-4000-8000-000000000000?verbose=true').send({ note: 'x' });
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ id: '00000000-0000-4000-8000-000000000000', verbose: true, note: 'x' });

        const koParam = await request(app).put('/users/not-a-uuid').send({ note: 'x' });
        expect(koParam.status).toBe(400);
        expect(koParam.body.errors[0].path).toMatch(/^\/params\//);

        const koBody = await request(app).put('/users/00000000-0000-4000-8000-000000000000').send({ note: '' });
        expect(koBody.status).toBe(400);
        expect(koBody.body.errors[0].path).toMatch(/^\/body\//);
    });
});

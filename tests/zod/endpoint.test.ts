import express from 'express';
import request from 'supertest';
import { z, defineEndpoint, registerSchema, registry, _resetRegistry } from '../../src/zod';

type RouteDef = { type: 'route'; route: { method: string; path: string; tags?: string[] } };
const findRoute = (method: string, path: string): RouteDef | undefined => {
    const found = registry.definitions.find(d => {
        const r = d as RouteDef;
        return r.type === 'route' && r.route?.method === method && r.route?.path === path;
    });
    return found as unknown as RouteDef | undefined;
};

describe('defineEndpoint — module shape', () => {
    beforeEach(() => _resetRegistry());

    test('returns { id, handler } where id matches the argument', () => {
        const ep = defineEndpoint('demo', () => {
            // no routes
        });
        expect(ep.id).toBe('demo');
        expect(typeof ep.handler).toBe('function');
    });

    test('forwards the Directus context to the setup callback', () => {
        const setupSpy = jest.fn();
        const ep = defineEndpoint('demo', setupSpy);
        const router = express.Router();
        const ctx = { services: { Foo: 1 }, getSchema: async () => ({}), logger: { info: jest.fn() } };
        ep.handler(router, ctx);
        expect(setupSpy).toHaveBeenCalledTimes(1);
        expect(setupSpy.mock.calls[0]?.[0]).toEqual(expect.any(Function));
        expect(setupSpy.mock.calls[0]?.[1]).toBe(ctx);
    });
});

describe('defineEndpoint — registry side-effects', () => {
    beforeEach(() => _resetRegistry());

    test('applies `/<id>` as default OpenAPI prefix to every route', () => {
        const ep = defineEndpoint('zod-demo', route => {
            route({
                method: 'post',
                path: '/hello',
                request: { body: z.object({ name: z.string() }) },
                responses: { 200: { description: 'OK' } },
                handler: (_req, res) => res.end(),
            });
            route({
                method: 'get',
                path: '/items',
                responses: { 200: { description: 'OK' } },
                handler: (_req, res) => res.end(),
            });
        });
        ep.handler(express.Router(), { services: {}, getSchema: async () => ({}) });

        expect(findRoute('post', '/zod-demo/hello')).toBeDefined();
        expect(findRoute('get', '/zod-demo/items')).toBeDefined();
    });

    test('per-route `prefix` overrides the default `/<id>` prefix', () => {
        const ep = defineEndpoint('outer', route => {
            route({
                method: 'get',
                path: '/x',
                prefix: '/explicit',
                responses: { 200: { description: 'OK' } },
                handler: (_req, res) => res.end(),
            });
        });
        ep.handler(express.Router(), { services: {}, getSchema: async () => ({}) });
        expect(findRoute('get', '/explicit/x')).toBeDefined();
        expect(findRoute('get', '/outer/x')).toBeUndefined();
    });

    test('translates Express params (`:id`) into OpenAPI braces alongside the prefix', () => {
        const ep = defineEndpoint('users', route => {
            route({
                method: 'get',
                path: '/by-id/:id',
                request: { params: z.object({ id: z.string() }) },
                responses: { 200: { description: 'OK' } },
                handler: (_req, res) => res.end(),
            });
        });
        ep.handler(express.Router(), { services: {}, getSchema: async () => ({}) });
        expect(findRoute('get', '/users/by-id/{id}')).toBeDefined();
    });

    test('normalises an id with leading or trailing slashes (no double-slash in OAS path)', () => {
        const ep = defineEndpoint('/leading/', route => {
            route({
                method: 'get',
                path: '/x',
                responses: { 200: { description: 'OK' } },
                handler: (_req, res) => res.end(),
            });
        });
        ep.handler(express.Router(), { services: {}, getSchema: async () => ({}) });
        expect(findRoute('get', '/leading/x')).toBeDefined();
        expect(findRoute('get', '//leading//x')).toBeUndefined();
    });
});

describe('defineEndpoint — runtime behaviour', () => {
    beforeEach(() => _resetRegistry());

    const buildApp = (ep: { handler: (router: express.Router, ctx: any) => void }, ctx: any = { services: {}, getSchema: async () => ({}) }) => {
        const app = express();
        app.use(express.json());
        const router = express.Router();
        ep.handler(router, ctx);
        app.use(router);
        app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            res.status(500).json({ message: err.message });
        });
        return app;
    };

    test('runs Zod validation before the handler and rejects invalid payloads', async () => {
        const handlerSpy = jest.fn();
        const ep = defineEndpoint('demo', route => {
            route({
                method: 'post',
                path: '/echo',
                request: { body: z.object({ name: z.string().min(1) }) },
                responses: { 200: { description: 'OK' } },
                handler: (req, res) => {
                    handlerSpy(req.body);
                    res.json(req.body);
                },
            });
        });
        const app = buildApp(ep);

        const ko = await request(app).post('/echo').send({ name: '' });
        expect(ko.status).toBe(400);
        expect(handlerSpy).not.toHaveBeenCalled();

        const ok = await request(app).post('/echo').send({ name: 'alice' });
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ name: 'alice' });
        expect(handlerSpy).toHaveBeenCalledWith({ name: 'alice' });
    });

    test('handler closes over the ctx from the setup callback', async () => {
        const fakeUser = { id: 'u1', email: 'alice@example.com' };
        const ep = defineEndpoint('demo', (route, { services, getSchema }) => {
            route({
                method: 'get',
                path: '/users/:id',
                request: { params: z.object({ id: z.string() }) },
                responses: { 200: { description: 'OK' } },
                handler: async (req, res) => {
                    const schema = await getSchema();
                    const u = await services.UsersService.read(req.params.id, schema);
                    res.json(u);
                },
            });
        });

        const ctx = {
            services: { UsersService: { read: jest.fn(async (id: string) => ({ ...fakeUser, id })) } },
            getSchema: jest.fn(async () => ({ kind: 'schema' })),
        };
        const app = buildApp(ep, ctx);
        const r = await request(app).get('/users/u42');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ ...fakeUser, id: 'u42' });
        expect(ctx.getSchema).toHaveBeenCalled();
        expect(ctx.services.UsersService.read).toHaveBeenCalledWith('u42', { kind: 'schema' });
    });

    test('forwards async handler errors to next(err)', async () => {
        const ep = defineEndpoint('demo', route => {
            route({
                method: 'get',
                path: '/boom',
                responses: { 500: { description: 'Server error' } },
                handler: async () => {
                    throw new Error('kaboom');
                },
            });
        });
        const r = await request(buildApp(ep)).get('/boom');
        expect(r.status).toBe(500);
        expect(r.body.message).toBe('kaboom');
    });

    test('schema $ref propagates from registerSchema through defineEndpoint', () => {
        const User = registerSchema('UserShape', z.object({ id: z.string().uuid() }));
        const ep = defineEndpoint('demo', route => {
            route({
                method: 'get',
                path: '/u',
                responses: { 200: { description: 'OK', schema: User } },
                handler: (_req, res) => res.end(),
            });
        });
        ep.handler(express.Router(), { services: {}, getSchema: async () => ({}) });
        const route = findRoute('get', '/demo/u');
        expect(route).toBeDefined();
        // Components.schemas.UserShape is added to the registry by registerSchema;
        // path responses reference it via $ref. We verify the route is registered;
        // the openapi.test.ts suite covers $ref emission separately.
    });
});

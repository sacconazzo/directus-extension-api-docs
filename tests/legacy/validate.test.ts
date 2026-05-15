/**
 * Regression coverage for the legacy `validate()` export, which wraps
 * `express-openapi-validator` against the OAS produced by `getConfig()`
 * + Directus's SpecificationService. We do not boot Directus; we substitute
 * a minimal SpecificationService double and isolate module evaluation so
 * `getConfig()` runs against a YAML fixture in `tests/mocks/legacy-validate`.
 */
import express from 'express';
import request from 'supertest';

// `@directus/extensions-sdk` ships as an ESM-only `export { ... }` bundle
// that Jest+ts-jest cannot evaluate in a CommonJS test context. Stubbing
// `defineEndpoint` to identity is sufficient: the production helper just
// returns its argument unchanged.
jest.mock('@directus/extensions-sdk', () => ({ defineEndpoint: (handler: unknown) => handler }));

const cwdSpy = jest.spyOn(process, 'cwd').mockImplementation(() => './tests/mocks/legacy-validate');

const mockServices = {
    SpecificationService: class {
        constructor(_config: unknown) {
            // no-op
        }
        oas = {
            generate: async () => ({
                openapi: '3.0.0',
                info: { title: 'core', version: '0.0.0' },
                paths: {},
                components: { schemas: {}, definitions: {} },
            }),
        };
    },
};

// Loaded synchronously, in source order, AFTER the cwd spy is active so
// `getConfig()` reads the fixture under tests/mocks/legacy-validate.
const endpoint = require('../../src/index').default as {
    validate: (router: express.Router, services: unknown, schema: unknown, paths?: string[]) => Promise<express.Router>;
};

afterAll(() => {
    cwdSpy.mockRestore();
});

const buildApp = async (paths?: string[]) => {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    await endpoint.validate(router, mockServices, {}, paths);
    router.post('/test/echo', (req, res) => res.json({ ok: true, body: req.body }));
    router.get('/test/required-query', (req, res) => res.json({ ok: true, query: req.query }));
    app.use(router);
    return app;
};

describe('legacy validate() — body validation', () => {
    test('rejects missing required body field', async () => {
        const app = await buildApp();
        const r = await request(app).post('/test/echo').send({});
        expect(r.status).toBe(400);
        expect(r.body).toHaveProperty('message');
        expect(r.body).toHaveProperty('errors');
    });

    test('rejects body that violates minLength', async () => {
        const app = await buildApp();
        const r = await request(app).post('/test/echo').send({ name: '' });
        expect(r.status).toBe(400);
    });

    test('accepts a valid body and lets the handler run', async () => {
        const app = await buildApp();
        const r = await request(app).post('/test/echo').send({ name: 'abc' });
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ ok: true, body: { name: 'abc' } });
    });
});

describe('legacy validate() — query parameter validation', () => {
    test('rejects when a required query parameter is missing', async () => {
        const app = await buildApp();
        const r = await request(app).get('/test/required-query');
        expect(r.status).toBe(400);
    });

    test('accepts when the required query parameter is present', async () => {
        const app = await buildApp();
        const r = await request(app).get('/test/required-query?id=42');
        expect(r.status).toBe(200);
        expect(r.body.query).toEqual({ id: '42' });
    });
});

describe('legacy validate() — `paths` argument scope', () => {
    test('passing a single path leaves other endpoints unvalidated by name', async () => {
        // express-openapi-validator returns 404 for unknown paths; with a
        // restricted set the unmatched route falls through to a 404 from
        // the validator (since unknown paths aren't in the spec). We only
        // assert the included path still validates.
        const app = await buildApp(['/test/echo']);
        const ko = await request(app).post('/test/echo').send({});
        expect(ko.status).toBe(400);
        const ok = await request(app).post('/test/echo').send({ name: 'x' });
        expect(ok.status).toBe(200);
    });
});

describe('legacy validate() — error envelope shape', () => {
    test('returns { message, errors } on 4xx (matches the format zodValidator emulates)', async () => {
        const app = await buildApp();
        const r = await request(app).post('/test/echo').send({});
        expect(typeof r.body.message).toBe('string');
        expect(Array.isArray(r.body.errors)).toBe(true);
    });
});

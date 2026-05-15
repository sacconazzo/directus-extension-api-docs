/**
 * Regression coverage for the GET `/oas` handler exposed by the extension.
 * We don't boot Directus: we evaluate `src/index.ts` against a fixture
 * `oasconfig.yaml` and a stubbed SpecificationService, then drive the
 * handler with supertest. Both legacy YAML and Zod registrations must
 * surface in the merged document.
 */
import express from 'express';
import request from 'supertest';
import { z, defineRoute, registerSchema, _resetRegistry } from '../../src/zod';

// `@directus/extensions-sdk` is ESM and Jest+ts-jest can't evaluate it in
// a CommonJS context. `defineEndpoint` is a passthrough so the stub is safe.
jest.mock('@directus/extensions-sdk', () => ({ defineEndpoint: (handler: unknown) => handler }));

const cwdSpy = jest.spyOn(process, 'cwd').mockImplementation(() => './tests/mocks/legacy-oas');

const coreSpec = {
    openapi: '3.0.0',
    info: { title: 'core-title', version: '0.0.0', description: 'core' },
    paths: { '/core/path': { get: { tags: ['CoreTag'], responses: { '200': { description: 'OK' } } } } },
    tags: [{ name: 'CoreTag' }],
    components: { schemas: { CoreSchema: { type: 'object' } } },
};

const mockServices = {
    SpecificationService: class {
        constructor(_config: unknown) {
            // no-op
        }
        oas = { generate: async () => JSON.parse(JSON.stringify(coreSpec)) };
    },
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

// Loaded synchronously after the cwd spy is active so `getConfig()` reads
// the YAML fixture under tests/mocks/legacy-oas. Module cache is shared
// with the file-level imports above (in particular `_resetRegistry`),
// so Zod registrations made in tests are visible to the handler.
const endpoint = require('../../src/index').default as {
    handler: (router: express.Router, ctx: { services: unknown; logger: unknown; getSchema: () => Promise<unknown> }) => void;
};

afterAll(() => cwdSpy.mockRestore());

beforeEach(() => _resetRegistry());

const buildApp = (accountability: Record<string, unknown> = { admin: true }) => {
    const app = express();
    const router = express.Router();
    endpoint.handler(router, { services: mockServices, logger: mockLogger, getSchema: async () => ({}) });
    app.use((req, _res, next) => {
        (req as unknown as { accountability: Record<string, unknown> }).accountability = accountability;
        next();
    });
    app.use(router);
    return app;
};

describe('legacy /oas handler — basic shape', () => {
    test('responds 200 with application/json', async () => {
        const r = await request(buildApp()).get('/oas');
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toMatch(/json/);
    });
});

describe('legacy /oas handler — YAML merge regression', () => {
    test('merges YAML paths into the core spec', async () => {
        const r = await request(buildApp()).get('/oas');
        expect(r.body.paths).toHaveProperty('/core/path');
        expect(r.body.paths).toHaveProperty('/custom/things');
    });

    test('appends YAML tags alongside core tags without duplication', async () => {
        const r = await request(buildApp()).get('/oas');
        const tagNames: string[] = (r.body.tags as Array<{ name: string }>).map(t => t.name);
        expect(tagNames).toEqual(expect.arrayContaining(['CoreTag', 'Custom']));
    });

    test('merges YAML schema components with core components', async () => {
        const r = await request(buildApp()).get('/oas');
        expect(r.body.components.schemas).toHaveProperty('CoreSchema');
        expect(r.body.components.schemas).toHaveProperty('Thing');
    });

    test('takes info.title / version / description from oasconfig when provided', async () => {
        const r = await request(buildApp()).get('/oas');
        expect(r.body.info.title).toBe('legacy-oas-fixture');
        expect(r.body.info.version).toBe('1.2.3');
        expect(r.body.info.description).toBe('regression fixture for the /oas handler');
    });
});

describe('legacy /oas handler — accountability gate', () => {
    test('does not inject custom paths when accountability is anonymous', async () => {
        const r = await request(buildApp({})).get('/oas'); // neither admin nor user
        expect(r.body.paths).not.toHaveProperty('/custom/things');
        expect(r.body.paths).toHaveProperty('/core/path');
    });

    test('injects custom paths when accountability.admin is true', async () => {
        const r = await request(buildApp({ admin: true })).get('/oas');
        expect(r.body.paths).toHaveProperty('/custom/things');
    });

    test('injects custom paths when accountability.user is set', async () => {
        const r = await request(buildApp({ user: 'u1' })).get('/oas');
        expect(r.body.paths).toHaveProperty('/custom/things');
    });
});

describe('legacy /oas handler — Zod registry contributions', () => {
    test('Zod-defined routes appear next to YAML and core paths', async () => {
        const ZodItem = registerSchema('ZodItem', z.object({ id: z.string() }));
        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/zod/items',
            tags: ['ZodTag'],
            responses: { 200: { description: 'OK', schema: ZodItem } },
            handler: (_req, res) => res.json([]),
        });

        const r = await request(buildApp()).get('/oas');
        expect(r.body.paths).toHaveProperty('/core/path');
        expect(r.body.paths).toHaveProperty('/custom/things');
        expect(r.body.paths).toHaveProperty('/zod/items');
        expect(r.body.components.schemas).toHaveProperty('ZodItem');
        expect((r.body.tags as Array<{ name: string }>).map(t => t.name)).toEqual(expect.arrayContaining(['ZodTag']));
    });

    test('Zod tags are deduplicated against existing tags', async () => {
        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/zod/another',
            tags: ['Custom'], // same name as the YAML tag
            responses: { 200: { description: 'OK' } },
            handler: (_req, res) => res.json({}),
        });
        const r = await request(buildApp()).get('/oas');
        const occurrences = (r.body.tags as Array<{ name: string }>).filter(t => t.name === 'Custom').length;
        expect(occurrences).toBe(1);
    });
});

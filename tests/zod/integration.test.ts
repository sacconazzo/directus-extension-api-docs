import express from 'express';
import { getConfig, merge, filterPaths } from '../../src/utils';
import { z, defineRoute, registerSchema, buildZodOasFragment, _resetRegistry } from '../../src/zod';

/**
 * Reproduces, in-process, the merge that the live `/api-docs/oas` route
 * performs in `src/index.ts`. We don't boot Directus; we build the same
 * pipeline (core spec stub → YAML config from `getConfig` → Zod fragment)
 * and assert the final document carries every contribution.
 */
const buildOas = (coreSpec: { paths: Record<string, unknown>; components: Record<string, unknown>; tags: Array<{ name: string; description?: string }> }) => {
    const swagger: { paths: Record<string, any>; components: Record<string, any>; tags: Array<{ name: string; description?: string }> } = JSON.parse(JSON.stringify(coreSpec));
    const config = getConfig();

    for (const path in config.paths) swagger.paths[path] = config.paths[path];
    for (const tag of config.tags) swagger.tags.push(tag);
    swagger.components = merge(config.components, swagger.components);

    const zodFragment = buildZodOasFragment();
    for (const path in zodFragment.paths) {
        swagger.paths[path] = merge(swagger.paths[path] || {}, zodFragment.paths[path]);
    }
    swagger.components = merge(swagger.components, zodFragment.components);
    for (const tag of zodFragment.tags) {
        if (!swagger.tags.find(t => t?.name === tag.name)) swagger.tags.push(tag);
    }
    return { swagger, config };
};

describe('integration: YAML + Zod merge over a stubbed core spec', () => {
    beforeEach(() => _resetRegistry());

    test('paths, components and tags from YAML and Zod coexist in the merged document', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => './tests/mocks/zod-mixed');

        const router = express.Router();
        const Item = registerSchema('ZodItem', z.object({ id: z.string(), name: z.string() }));
        defineRoute(router, {
            method: 'get',
            path: '/zod/items',
            tags: ['zod-tag'],
            request: { query: z.object({ q: z.string().optional() }) },
            responses: { 200: { description: 'OK', schema: Item } },
            handler: (_req, res) => res.json([]),
        });

        const core = {
            paths: { '/items': { get: { tags: ['core'] } } },
            components: { schemas: { CoreThing: { type: 'object' } } },
            tags: [{ name: 'core' }],
        };

        const { swagger } = buildOas(core);

        expect(swagger.paths).toHaveProperty('/items');
        expect(swagger.paths).toHaveProperty('/yaml/items');
        expect(swagger.paths).toHaveProperty('/zod/items');

        expect(swagger.components.schemas).toHaveProperty('CoreThing');
        expect(swagger.components.schemas).toHaveProperty('YamlItem');
        expect(swagger.components.schemas).toHaveProperty('ZodItem');

        const tagNames = swagger.tags.map(t => t.name);
        expect(tagNames).toContain('core');
        expect(tagNames).toContain('yaml-tag');
        expect(tagNames).toContain('zod-tag');
    });

    test('publishedTags filtering applies uniformly to YAML and Zod paths', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => './tests/mocks/zod-mixed');

        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/zod/public',
            tags: ['public-tag'],
            responses: { 200: { description: 'OK' } },
            handler: (_req, res) => res.json({}),
        });
        defineRoute(router, {
            method: 'get',
            path: '/zod/private',
            tags: ['internal-tag'],
            responses: { 200: { description: 'OK' } },
            handler: (_req, res) => res.json({}),
        });

        const core = { paths: {}, components: {}, tags: [] as Array<{ name: string }> };
        const { swagger, config } = buildOas(core);

        const filtered = JSON.parse(JSON.stringify(swagger));
        filterPaths({ ...config, publishedTags: ['public-tag'] }, filtered);

        expect(filtered.paths['/zod/public']).toBeDefined();
        expect(filtered.paths['/zod/private']?.get).toBeUndefined();
    });

    test('does not duplicate tags shared between YAML and Zod registrations', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => './tests/mocks/zod-mixed');

        const router = express.Router();
        defineRoute(router, {
            method: 'get',
            path: '/zod/shared',
            tags: ['yaml-tag'], // same name as the YAML mock
            responses: { 200: { description: 'OK' } },
            handler: (_req, res) => res.json({}),
        });

        const core = { paths: {}, components: {}, tags: [] as Array<{ name: string }> };
        const { swagger } = buildOas(core);
        const occurrences = swagger.tags.filter(t => t.name === 'yaml-tag').length;
        expect(occurrences).toBe(1);
    });

    test('an empty registry leaves YAML behaviour identical to the legacy pipeline', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => './tests/mocks/zod-mixed');

        const core = { paths: {}, components: {}, tags: [] as Array<{ name: string }> };
        const { swagger } = buildOas(core);

        expect(swagger.paths).toHaveProperty('/yaml/items');
        expect(swagger.paths).not.toHaveProperty('/zod/items');
    });
});

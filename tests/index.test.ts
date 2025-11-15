import { oasConfig, oas } from '../src/types';
import { getConfig, getPackage, filterPaths, merge } from '../src/utils';

describe('openapi config generation', () => {
    afterAll(async () => {
        //
    });

    beforeAll(async () => {
        //
    });

    afterEach(() => {
        jest.resetAllMocks();
        jest.restoreAllMocks();
    });

    test('should be an empty object', async () => {
        const test = getConfig();
        expect(test).toHaveProperty('docsPath');
        expect(test).toHaveProperty('info');
        expect(test).toHaveProperty('tags');
        expect(test).toHaveProperty('paths');
        expect(test).toHaveProperty('components');
    });

    test('should merge with oasconfig', async () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/oasconfig';
        });
        const test = getConfig();
        expect(test).toHaveProperty('docsPath');
        expect(test).toHaveProperty('tags');
        expect(test).toHaveProperty('paths');
        expect(test).toHaveProperty('components');
        expect(test.info).toHaveProperty('title');
        expect(test.info).toHaveProperty('description');
        expect(test.info).toHaveProperty('version');
    });

    test('should merge with custom oas', async () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/customoas';
        });
        const test = getConfig();
        expect(test).toHaveProperty('docsPath');
        expect(test).toHaveProperty('info');
        expect(test).toHaveProperty('tags');
        expect(test).toHaveProperty('components');
        expect(test.paths).toHaveProperty('/mypath/countries_ext');
    });

    test('should merge with config and custom oas', async () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/merge';
        });
        const test = getConfig();
        expect(test).toHaveProperty('docsPath');
        expect(test).toHaveProperty('info');
        expect(test).toHaveProperty('tags');
        expect(test).toHaveProperty('components');
        expect(test.paths).toHaveProperty('/mypath/countries');
        expect(test.paths).toHaveProperty('/mypath2/countries_ext');
    });
});

describe('getPackage', () => {
    test('should be valid', async () => {
        const test = await getPackage();
        expect(test).toHaveProperty('name');
        expect(test).toHaveProperty('version');
        expect(test).toHaveProperty('description');
    });
    test('should return empty object when package.json not found', async () => {
        const originalCwd = process.cwd();
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return '/nonexistent/path';
        });
        const test = await getPackage();
        expect(test).toEqual({});
        process.cwd = () => originalCwd;
    });
});

describe('filterPaths', () => {
    test('should filter paths based on published tags', () => {
        const oasConfig: oasConfig = {
            docsPath: 'api-docs',
            info: {},
            useAuthentication: true,
            tags: [],
            components: {},
            publishedTags: ['tag2'],
            paths: {},
        };
        const oas: oas = {
            info: {},
            tags: [{ name: 'tag1' }, { name: 'tag2' }],
            components: {},
            paths: {
                endpoint1: {
                    get: {
                        tags: ['tag1', 'tag2'],
                    },
                    post: {
                        tags: ['tag1', 'tag2'],
                    },
                },
                endpoint2: {
                    get: { tags: ['tag1', 'tag3'] },
                    post: { tags: ['tag1', 'tag3'] },
                },
            },
        };
        filterPaths(oasConfig, oas);
        expect(oas.paths.endpoint1).toHaveProperty('get');
        expect(oas.paths.endpoint1).toHaveProperty('post');
        expect(oas.paths.endpoint1?.get?.tags.length).toEqual(1);
        expect(oas.paths.endpoint1?.post?.tags.length).toEqual(1);
        expect(oas.paths.endpoint2?.get).toBeUndefined();
        expect(oas.paths.endpoint2?.post).toBeUndefined();
        expect(oas.tags.length).toEqual(1);
        expect(oas.tags[0].name).toEqual('tag2');
    });

    test('should handle empty publishedTags array', () => {
        const oasConfig: oasConfig = {
            docsPath: 'api-docs',
            info: {},
            useAuthentication: true,
            tags: [],
            components: {},
            publishedTags: [],
            paths: {},
        };
        const oas: oas = {
            info: {},
            tags: [{ name: 'tag1' }, { name: 'tag2' }],
            components: {},
            paths: {
                endpoint1: {
                    get: { tags: ['tag1'] },
                },
            },
        };
        filterPaths(oasConfig, oas);
        expect(oas.paths.endpoint1?.get).toBeUndefined();
        expect(oas.tags.length).toEqual(0);
    });

    test('should handle endpoints with multiple published tags', () => {
        const oasConfig: oasConfig = {
            docsPath: 'api-docs',
            info: {},
            useAuthentication: true,
            tags: [],
            components: {},
            publishedTags: ['tag1', 'tag2', 'tag3'],
            paths: {},
        };
        const oas: oas = {
            info: {},
            tags: [{ name: 'tag1' }, { name: 'tag2' }, { name: 'tag3' }],
            components: {},
            paths: {
                endpoint1: {
                    get: { tags: ['tag1', 'tag2', 'tag3'] },
                },
            },
        };
        filterPaths(oasConfig, oas);
        expect(oas.paths.endpoint1).toHaveProperty('get');
        expect(oas.paths.endpoint1?.get?.tags.length).toEqual(3);
        expect(oas.tags.length).toEqual(3);
    });

    test('should handle endpoints without tags', () => {
        const oasConfig: oasConfig = {
            docsPath: 'api-docs',
            info: {},
            useAuthentication: true,
            tags: [],
            components: {},
            publishedTags: ['tag1'],
            paths: {},
        };
        const oas: oas = {
            info: {},
            tags: [{ name: 'tag1' }],
            components: {},
            paths: {
                endpoint1: {
                    get: { tags: [] },
                },
            },
        };
        filterPaths(oasConfig, oas);
        expect(oas.paths.endpoint1?.get).toBeUndefined();
    });
});

describe('merge', () => {
    test('should deep merge two simple objects', () => {
        const obj1 = { a: 1, b: 2 };
        const obj2 = { b: 3, c: 4 };
        const result = merge(obj1, obj2);
        expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('should deep merge nested objects', () => {
        const obj1 = { a: { x: 1, y: 2 }, b: 3 };
        const obj2 = { a: { y: 3, z: 4 }, c: 5 };
        const result = merge(obj1, obj2);
        expect(result).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 3, c: 5 });
    });

    test('should merge arrays', () => {
        const obj1 = { arr: [1, 2] };
        const obj2 = { arr: [3, 4] };
        const result = merge(obj1, obj2);
        expect(result.arr).toEqual([3, 4]);
    });

    test('should handle empty objects', () => {
        const obj1 = {};
        const obj2 = { a: 1, b: 2 };
        const result = merge(obj1, obj2);
        expect(result).toEqual({ a: 1, b: 2 });
    });

    test('should merge complex nested structures', () => {
        const obj1 = {
            components: {
                schemas: { User: { type: 'object' } },
                responses: { 200: { description: 'OK' } },
            },
        };
        const obj2 = {
            components: {
                schemas: { Post: { type: 'object' } },
                parameters: { id: { in: 'path' } },
            },
        };
        const result = merge(obj1, obj2);
        expect(result.components.schemas).toHaveProperty('User');
        expect(result.components.schemas).toHaveProperty('Post');
        expect(result.components.responses).toHaveProperty('200');
        expect(result.components.parameters).toHaveProperty('id');
    });

    test('should handle null and undefined values', () => {
        const obj1 = { a: 1, b: null };
        const obj2 = { b: 2, c: undefined };
        const result = merge(obj1, obj2);
        expect(result).toEqual({ a: 1, b: 2, c: undefined });
    });

    test('should overwrite primitive values', () => {
        const obj1 = { a: 'hello', b: 10, c: true };
        const obj2 = { a: 'world', b: 20 };
        const result = merge(obj1, obj2);
        expect(result).toEqual({ a: 'world', b: 20, c: true });
    });
});

describe('getConfig edge cases', () => {
    test('should return default config when no oasconfig exists', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/nonexistent';
        });
        const test = getConfig();
        expect(test.docsPath).toBe('api-docs');
        expect(test.useAuthentication).toBe(false);
        expect(test.tags).toEqual([]);
        expect(test.publishedTags).toEqual([]);
    });

    test('should handle missing oas.yaml files gracefully', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/oasconfig';
        });
        const test = getConfig();
        expect(test).toBeDefined();
        expect(test.docsPath).toBeDefined();
    });
});

describe('bundled extension support', () => {
    test('should merge oas.yaml from bundle extension src subdirectories', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/bundle';
        });
        const test = getConfig();
        expect(test).toHaveProperty('docsPath');
        expect(test).toHaveProperty('tags');
        expect(test).toHaveProperty('paths');
        expect(test).toHaveProperty('components');

        // Check that routes from bundled sub-extensions are included
        expect(test.paths).toHaveProperty('/bundle/items');
        expect(test.paths).toHaveProperty('/bundle/users');

        // Check that tags from bundled sub-extensions are included
        expect(test.tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'bundle-routes' }), expect.objectContaining({ name: 'bundle-users' })]));

        // Check that components from bundled sub-extensions are included
        expect(test.components).toHaveProperty('schemas');
        expect(test.components.schemas).toHaveProperty('BundleItem');
    });

    test('should merge both bundled and non-bundled extensions', () => {
        jest.spyOn(process, 'cwd').mockImplementation(() => {
            return './tests/mocks/mixed';
        });
        const test = getConfig();

        // Check that routes from both types are included
        expect(test.paths).toHaveProperty('/regular/endpoint');
        expect(test.paths).toHaveProperty('/bundle/route-a');

        // Check that tags from both types are included
        expect(test.tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'regular' }), expect.objectContaining({ name: 'bundle-a' })]));
    });
});

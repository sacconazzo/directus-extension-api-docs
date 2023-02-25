import { oasConfig, oas } from '../src/types';
import { getConfig, getPackage, filterPaths } from '../src/utils';

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
});

describe('filterPaths', () => {
    test('should be valid', () => {
        const oasConfig: oasConfig = {
            docsPath: 'api-docs',
            info: {},
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
        expect(oas.paths.endpoint2?.get).toBeUndefined();
        expect(oas.paths.endpoint2?.post).toBeUndefined();
        expect(oas.tags.length).toEqual(1);
        expect(oas.tags[0].name).toEqual('tag2');
    });
});

import { getConfig } from '../src/utils';

describe('openapi config generation', () => {
    afterAll(async () => {
        //
    });

    beforeAll(async () => {
        //
    });

    beforeEach(() => {
        //
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

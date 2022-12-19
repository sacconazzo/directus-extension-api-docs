import { getConfig } from '../src/utils';

describe('getConfig sample test', () => {
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
        expect(test).toStrictEqual({});
    });
});

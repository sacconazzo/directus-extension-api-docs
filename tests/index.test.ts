import extension from '../src/index';

const OpenAPISchemaValidator = require('openapi-schema-validator').default;
const openAPIValidator = new OpenAPISchemaValidator({
    version: 3,
});

const fs = require('fs');
const path = require('path');

describe('extension-api-docs', () => {
    afterAll(async () => {
        //
    });

    beforeAll(async () => {
        //
    });

    describe('extension', () => {
        test('shoud right id', async () => {
            expect(extension.id).toBe('api-docs');
        });
    });

    describe.skip('schemas', () => {
        const openaApiRoot = {
            openapi: '3.0.1',
            info: {
                title: 'test',
                description: 'Directus BO & API',
                version: '0.2.0',
            },
            servers: [
                {
                    url: '/',
                    description: 'Your current Directus instance.',
                },
            ],
            paths: {
                '/endpoint': {},
            },
        };

        beforeEach(() => {
            openaApiRoot.paths['/endpoint'] = {};
        });

        test('should be right send-otp definition', async () => {
            const pathFile = path.join(__dirname, '../src/paths/send-otp.json');
            const pathSchema = JSON.parse(fs.readFileSync(pathFile, 'utf-8'));

            openaApiRoot.paths['/endpoint'] = pathSchema;

            const res = openAPIValidator.validate(openaApiRoot);
            if (res.errors.length) {
                console.error(res.errors);
                process.exit(1);
            }
            expect(res.errors.length).toBe(0);
        });

        test('should be right validate-otp definition', async () => {
            const pathFile = path.join(__dirname, '../src/paths/validate-otp.json');
            const pathSchema = JSON.parse(fs.readFileSync(pathFile, 'utf-8'));

            openaApiRoot.paths['/endpoint'] = pathSchema;

            const res = openAPIValidator.validate(openaApiRoot);
            if (res.errors.length) {
                console.error(res.errors);
                process.exit(1);
            }
            expect(res.errors.length).toBe(0);
        });
    });
});

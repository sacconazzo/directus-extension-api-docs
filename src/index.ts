import { defineEndpoint } from '@directus/extensions-sdk';

const swaggerUi = require('swagger-ui-express');
const { findWorkspaceDir } = require('@pnpm/find-workspace-dir');
const directusDir = process.cwd();

const fs = require('fs');
const path = require('path');

interface config {
    id?: string;
    tags?: any;
    paths?: any;
}

function getConfig(): config {
    try {
        const configFile = path.join(directusDir, './extensions/endpoints/oas.json');
        return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
        return {};
    }
}

const config = getConfig();

const id = config?.id || 'api-docs';

export default {
    id,
    handler: defineEndpoint((router, { services, exceptions, logger }) => {
        const { ServiceUnavailableException } = exceptions;
        const { SpecificationService } = services;

        const options = {
            swaggerOptions: {
                url: `/${id}}/oas`,
            },
        };

        router.use('/', swaggerUi.serve);
        router.get('/', swaggerUi.setup({}, options));

        router.get('/oas', async (req: any, res: any, next: any) => {
            try {
                const service = new SpecificationService({
                    accountability: { admin: true }, // null or accountability.admin = true needed
                    schema: req.schema,
                });

                const swagger = await service.oas.generate();

                const pkg = require(`${await findWorkspaceDir('.')}/package.json`);

                swagger.info.title = pkg.name;
                swagger.info.version = pkg.version;
                swagger.info.description = pkg.description;

                // inject custom-endpoints
                try {
                    if (config?.paths) {
                        for (const path in config.paths) {
                            swagger.paths[path] = config.paths[path];
                        }
                    }
                    if (config?.tags) {
                        for (const tag of config.tags) {
                            swagger.tags.push(tag);
                        }
                    }
                } catch (e) {
                    logger.info('No custom definitions');
                }

                res.json(swagger);
            } catch (error: any) {
                return next(new ServiceUnavailableException(error.message || error[0].message));
            }
        });
    }),
};

import { defineEndpoint } from '@directus/extensions-sdk';
import { Router, Request, Response } from 'express';
const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const { findWorkspaceDir } = require('@pnpm/find-workspace-dir');
const directusDir = process.cwd();

const fs = require('fs');
const path = require('path');

interface oasconfig {
    docsPath?: string;
    tags?: Array<object>;
    paths?: {
        [key: string]: object;
    };
}

interface oas {
    openapi: string;
    info: object;
    paths: {
        [key: string]: any;
    };
}

function getConfig(): oasconfig {
    try {
        const configFile = path.join(directusDir, './extensions/endpoints/oasconfig.json');
        return JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
        return {};
    }
}

const config = getConfig();

function validate(router: Router, paths: Array<string>) {
    if (config?.paths) {
        const oas: oas = { openapi: '3.0.1', info: { title: '', description: '', version: '' }, paths: {} };
        for (const path of paths) {
            oas.paths[path] = config.paths[path];
        }
        router.use(
            OpenApiValidator.middleware({
                apiSpec: oas,
            }),
        );
        router.use((err: any, _req: Request, res: Response, _next: any) => {
            res.status(err.status || 500).json({
                message: err.message,
                errors: err.errors,
            });
        });
    }
}

const id = config?.docsPath || 'api-docs';

export default {
    id,
    validate,
    handler: defineEndpoint((router, { services, exceptions, logger }) => {
        const { ServiceUnavailableException } = exceptions;
        const { SpecificationService } = services;

        const options = {
            swaggerOptions: {
                url: `/${id}/oas`,
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

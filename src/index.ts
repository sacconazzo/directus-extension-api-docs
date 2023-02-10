/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineEndpoint } from '@directus/extensions-sdk';
import { SchemaOverview } from '@directus/shared/types';
import { Router, Request, Response, NextFunction } from 'express';
import { getConfig, getOas, merge } from './utils';

const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const { findWorkspaceDir } = require('@pnpm/find-workspace-dir');

const config = getConfig();

const id = config.docsPath;

async function validate(router: Router, services: any, schema: SchemaOverview, paths: Array<string>): Promise<Router> {
    if (config?.paths) {
        const oas = await getOas(services, schema);

        // replace with custom endpoints
        if (paths) {
            for (const path of paths) {
                oas.paths[path] = config.paths[path];
            }
        } else {
            oas.paths = config.paths;
        }

        if (config.components) {
            oas.components = config.components;
        } else {
            // fix compatibility openapi
            delete oas.components.definitions;
            // delete oas.components['x-metadata']
            // delete oas.components['securitySchemes']
            // delete oas.components['parameters']
            // delete oas.components['responses']
            delete oas.components.schemas;
        }

        router.use(
            OpenApiValidator.middleware({
                apiSpec: oas,
            }),
        );
        router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
            res.status(err.status || 500).json({
                message: err.message,
                errors: err.errors,
            });
        });
    }
    return router;
}

export default {
    id,
    validate,
    handler: defineEndpoint((router, { services, exceptions, logger, getSchema }) => {
        const { ServiceUnavailableException } = exceptions;

        const options = {
            swaggerOptions: {
                url: `/${id}/oas`,
            },
        };

        router.use('/', swaggerUi.serve);
        router.get('/', swaggerUi.setup({}, options));

        router.get('/oas', async (_req: Request, res: Response, next: NextFunction) => {
            try {
                const schema = await getSchema();
                const swagger = await getOas(services, schema);

                try {
                    const pkg = require(`${await findWorkspaceDir('.')}/package.json`);

                    swagger.info.title = pkg?.name || config.info.title || swagger.info.title;
                    swagger.info.version = pkg?.version || config.info.version || swagger.info.version;
                    swagger.info.description = pkg?.description || config.info.description || swagger.info.description;
                } catch (e) {}

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
                    if (config?.components) swagger.components = merge(config.components, swagger.components);
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

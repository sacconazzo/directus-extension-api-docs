/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineEndpoint } from '@directus/extensions-sdk';
// import { SchemaOverview } from '@directus/shared/types';
import { SchemaOverview } from '@directus/types';
import { Router, Request, Response, NextFunction } from 'express';
import { getConfig, getOas, getOasAll, getPackage, merge, filterPaths } from './utils';

const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');

const config = getConfig();

const id = config.docsPath;

async function validate(router: Router, services: any, schema: SchemaOverview, paths: Array<string>): Promise<Router> {
    if (config?.paths) {
        const oas = await getOasAll(services, schema);

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
    handler: defineEndpoint((router, { services, logger, getSchema }) => {
        const options = {
            swaggerOptions: {
                url: `/${id}/oas`,
            },
        };

        router.use('/', swaggerUi.serve);
        router.get('/', swaggerUi.setup({}, options));

        router.get('/oas', async (req: Request, res: Response, next: NextFunction) => {
            try {
                const schema = await getSchema();

                const accountability = config.useAuthentication ? (req as any).accountability : { admin: true };

                const swagger = await getOas(services, schema, accountability);

                const pkg = await getPackage();

                swagger.info.title = config.info.title || pkg?.name || swagger.info.title;
                swagger.info.version = config.info.version || pkg?.version || swagger.info.version;
                swagger.info.description = config.info.description || pkg?.description || swagger.info.description;

                // inject custom-endpoints
                try {
                    for (const path in config.paths) {
                        swagger.paths[path] = config.paths[path];
                    }

                    for (const tag of config.tags) {
                        swagger.tags.push(tag);
                    }

                    swagger.components = merge(config.components, swagger.components);
                } catch (e) {
                    logger.info('No custom definitions');
                }

                if (config.publishedTags?.length) filterPaths(config, swagger);

                res.json(swagger);
            } catch (error: any) {
                return next(new Error(error.message || error[0].message));
            }
        });
    }),
};

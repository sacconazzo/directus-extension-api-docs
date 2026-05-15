import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Augments z so `.openapi(name | metadata)` is available everywhere.
// Idempotent: calling twice is safe (the library guards against it).
extendZodWithOpenApi(z);

export { z };
export { registry, registerSchema, _resetRegistry } from './registry';
export { defineRoute } from './route';
export type { RouteConfig, HttpMethod, ResponseDef } from './route';
export { defineEndpoint } from './endpoint';
export type { EndpointSetup, EndpointContext, RouteHelper } from './endpoint';
export { zodValidator } from './validate';
export type { ZodValidatorTargets } from './validate';
export { buildZodOasFragment } from './openapi';
export type { ZodOasFragment } from './openapi';

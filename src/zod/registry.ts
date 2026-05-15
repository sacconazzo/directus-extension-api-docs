import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { ZodTypeAny } from 'zod';

/**
 * Process-wide singleton registry. All extensions importing
 * `directus-extension-api-docs/zod` share the same Node module instance,
 * so every `registerSchema` / `defineRoute` call accumulates here and is
 * later merged into `/api-docs/oas` alongside YAML definitions.
 */
export const registry = new OpenAPIRegistry();

/**
 * Register a reusable schema under `components.schemas.<name>` and return
 * the same schema annotated with `.openapi(name)` so subsequent references
 * become a `$ref` instead of an inlined object.
 */
export function registerSchema<T extends ZodTypeAny>(name: string, schema: T): T {
    return registry.register(name, schema) as unknown as T;
}

/** Drop every registered schema/path. Intended for tests only. */
export function _resetRegistry(): void {
    // OpenAPIRegistry exposes `definitions` as a getter that returns a fresh
    // array each call, so we have to mutate the private backing field.
    (registry as unknown as { _definitions: unknown[] })._definitions.length = 0;
}

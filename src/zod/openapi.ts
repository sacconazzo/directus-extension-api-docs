import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';

export type ZodOasFragment = {
    paths: Record<string, Record<string, unknown>>;
    components: {
        schemas?: Record<string, unknown>;
        securitySchemes?: Record<string, unknown>;
        parameters?: Record<string, unknown>;
    };
    tags: Array<{ name: string; description?: string }>;
};

const EMPTY_FRAGMENT: ZodOasFragment = { paths: {}, components: {}, tags: [] };

/**
 * Materialise the contents of the singleton `registry` into an OpenAPI 3.0
 * fragment that the main `/api-docs/oas` handler can deep-merge with the
 * core Directus spec and any YAML-declared paths/components. Tags are
 * inferred from registered operations so users don't have to repeat them.
 */
export function buildZodOasFragment(): ZodOasFragment {
    if (registry.definitions.length === 0) return { ...EMPTY_FRAGMENT, paths: {}, components: {}, tags: [] };

    const generator = new OpenApiGeneratorV3(registry.definitions);
    const document = generator.generateDocument({
        openapi: '3.0.0',
        info: { title: '_zod_', version: '0.0.0' },
    });

    const paths = (document.paths ?? {}) as Record<string, Record<string, unknown>>;
    const tagSet = new Map<string, { name: string; description?: string }>();
    for (const path of Object.keys(paths)) {
        const operations = paths[path] ?? {};
        for (const op of Object.values(operations)) {
            const tags = (op as { tags?: string[] }).tags ?? [];
            for (const name of tags) {
                if (!tagSet.has(name)) tagSet.set(name, { name });
            }
        }
    }

    return {
        paths,
        components: (document.components ?? {}) as ZodOasFragment['components'],
        tags: Array.from(tagSet.values()),
    };
}

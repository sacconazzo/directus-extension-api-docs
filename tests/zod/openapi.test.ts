import express from 'express';
import OpenAPISchemaValidator from 'openapi-schema-validator';
import { z, defineRoute, registerSchema, buildZodOasFragment, _resetRegistry } from '../../src/zod';

const validator = new OpenAPISchemaValidator({ version: 3 });
const router = () => express.Router();
const noop = ((_req: unknown, res: { end: () => unknown }) => res.end()) as never;

const wrap = (fragment: ReturnType<typeof buildZodOasFragment>) => ({
    openapi: '3.0.0',
    info: { title: 't', version: '0.0.0' },
    paths: fragment.paths,
    components: fragment.components,
    tags: fragment.tags,
});

const op = (fragment: ReturnType<typeof buildZodOasFragment>, path: string, method: string) => (fragment.paths[path] as Record<string, unknown>)[method] as Record<string, unknown>;

describe('buildZodOasFragment — empty / shape', () => {
    beforeEach(() => _resetRegistry());

    test('returns an empty fragment when nothing is registered', () => {
        const fragment = buildZodOasFragment();
        expect(fragment).toEqual({ paths: {}, components: {}, tags: [] });
    });

    test('produces a syntactically valid OpenAPI 3.0 document for a typical route', () => {
        const User = registerSchema('User', z.object({ id: z.string().uuid(), email: z.string().email() }));
        defineRoute(router(), {
            method: 'get',
            path: '/users/:id',
            tags: ['Users'],
            summary: 'Read one user',
            description: 'Returns a user by id',
            security: [{ Auth: [] }],
            request: { params: z.object({ id: z.string().uuid() }) },
            responses: {
                200: { description: 'OK', schema: User },
                404: { description: 'Not Found' },
            },
            handler: noop,
        });
        const fragment = buildZodOasFragment();
        const errors = validator.validate(wrap(fragment) as never).errors;
        expect(errors).toEqual([]);
        expect(fragment.paths['/users/{id}']).toBeDefined();
        expect(fragment.components.schemas?.User).toBeDefined();
        expect(fragment.tags).toEqual([{ name: 'Users' }]);
    });

    test('multiple routes accumulate without overwriting each other', () => {
        defineRoute(router(), { method: 'get', path: '/a', tags: ['A'], responses: { 200: { description: 'OK' } }, handler: noop });
        defineRoute(router(), { method: 'get', path: '/b', tags: ['B'], responses: { 200: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        expect(Object.keys(fragment.paths).sort()).toEqual(['/a', '/b']);
        expect(fragment.tags.map(t => t.name).sort()).toEqual(['A', 'B']);
    });

    test('multiple methods on the same path coexist', () => {
        defineRoute(router(), { method: 'get', path: '/things/:id', request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: 'OK' } }, handler: noop });
        defineRoute(router(), { method: 'delete', path: '/things/:id', request: { params: z.object({ id: z.string() }) }, responses: { 204: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        const path = fragment.paths['/things/{id}'] as Record<string, unknown>;
        expect(Object.keys(path).sort()).toEqual(['delete', 'get']);
    });
});

describe('buildZodOasFragment — request shape', () => {
    beforeEach(() => _resetRegistry());

    test('emits requestBody with application/json content', () => {
        const Body = z.object({ name: z.string() });
        defineRoute(router(), { method: 'post', path: '/x', request: { body: Body }, responses: { 200: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        const operation = op(fragment, '/x', 'post') as { requestBody?: { content: Record<string, { schema: unknown }> } };
        expect(operation.requestBody?.content['application/json']?.schema).toBeDefined();
    });

    test('uses $ref instead of inlining when the body schema was registered', () => {
        const Body = registerSchema('UserId', z.object({ user_id: z.string() }));
        defineRoute(router(), { method: 'post', path: '/x', request: { body: Body }, responses: { 200: { description: 'OK', schema: Body } }, handler: noop });
        const fragment = buildZodOasFragment();
        const reqBody = (op(fragment, '/x', 'post') as { requestBody: { content: Record<string, { schema: { $ref: string } }> } }).requestBody;
        expect(reqBody.content['application/json']?.schema.$ref).toBe('#/components/schemas/UserId');
    });

    test('captures path and query parameters with the right `in` value', () => {
        defineRoute(router(), {
            method: 'get',
            path: '/legacy/:id',
            request: {
                params: z.object({ id: z.string() }),
                query: z.object({ verbose: z.coerce.boolean().optional() }),
            },
            responses: { 200: { description: 'OK' } },
            handler: noop,
        });
        const fragment = buildZodOasFragment();
        const operation = op(fragment, '/legacy/{id}', 'get') as { parameters?: Array<{ in: string; name: string; required?: boolean }> };
        const params = operation.parameters ?? [];
        expect(params.find(p => p.name === 'id')?.in).toBe('path');
        expect(params.find(p => p.name === 'id')?.required).toBe(true);
        expect(params.find(p => p.name === 'verbose')?.in).toBe('query');
        expect(params.find(p => p.name === 'verbose')?.required).toBe(false);
    });

    test('honours .openapi() metadata (description, example) on fields', () => {
        const Body = z.object({ email: z.string().email().openapi({ example: 'a@b.io', description: 'user email' }) });
        defineRoute(router(), { method: 'post', path: '/x', request: { body: Body }, responses: { 200: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        const reqBody = (op(fragment, '/x', 'post') as { requestBody: { content: Record<string, { schema: { properties?: Record<string, { example?: string; description?: string }> } }> } })
            .requestBody;
        const emailField = reqBody.content['application/json']?.schema.properties?.email;
        expect(emailField?.example).toBe('a@b.io');
        expect(emailField?.description).toBe('user email');
    });
});

describe('buildZodOasFragment — response shape', () => {
    beforeEach(() => _resetRegistry());

    test('includes a content block when a response schema is provided', () => {
        const User = registerSchema('UserResp', z.object({ id: z.string() }));
        defineRoute(router(), { method: 'get', path: '/u', responses: { 200: { description: 'OK', schema: User } }, handler: noop });
        const fragment = buildZodOasFragment();
        const response200 = (op(fragment, '/u', 'get') as { responses: Record<string, { description: string; content?: Record<string, { schema: { $ref?: string } }> }> }).responses['200'];
        expect(response200?.description).toBe('OK');
        expect(response200?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/UserResp');
    });

    test('omits the content block when no schema is provided', () => {
        defineRoute(router(), { method: 'get', path: '/no', responses: { 204: { description: 'No content' } }, handler: noop });
        const fragment = buildZodOasFragment();
        const response204 = (op(fragment, '/no', 'get') as { responses: Record<string, { content?: unknown; description: string }> }).responses['204'];
        expect(response204?.description).toBe('No content');
        expect(response204?.content).toBeUndefined();
    });

    test('emits one entry per declared status code', () => {
        defineRoute(router(), {
            method: 'get',
            path: '/multi',
            responses: {
                200: { description: 'OK', schema: z.object({ x: z.string() }) },
                401: { description: 'Unauthorized' },
                403: { description: 'Forbidden' },
                500: { description: 'Server Error' },
            },
            handler: noop,
        });
        const fragment = buildZodOasFragment();
        const responses = (op(fragment, '/multi', 'get') as { responses: Record<string, unknown> }).responses;
        expect(Object.keys(responses).sort()).toEqual(['200', '401', '403', '500']);
    });
});

describe('buildZodOasFragment — Zod feature coverage', () => {
    beforeEach(() => _resetRegistry());

    const docFor = (schema: z.ZodTypeAny) => {
        defineRoute(router(), { method: 'post', path: '/x', request: { body: schema }, responses: { 200: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        const reqBody = (op(fragment, '/x', 'post') as { requestBody: { content: Record<string, { schema: Record<string, unknown> }> } }).requestBody;
        return reqBody.content['application/json']?.schema as Record<string, unknown>;
    };

    test('z.string with constraints', () => {
        const schema = docFor(
            z.object({
                s: z
                    .string()
                    .min(2)
                    .max(5)
                    .regex(/^[a-z]+$/),
            }),
        ) as { properties: { s: { type: string; minLength?: number; maxLength?: number; pattern?: string } } };
        expect(schema.properties.s.type).toBe('string');
        expect(schema.properties.s.minLength).toBe(2);
        expect(schema.properties.s.maxLength).toBe(5);
        expect(schema.properties.s.pattern).toBeDefined();
    });

    test('z.number with constraints', () => {
        const schema = docFor(z.object({ n: z.number().int().min(0).max(10) })) as { properties: { n: { type: string; minimum?: number; maximum?: number } } };
        expect(schema.properties.n.type).toBe('integer');
        expect(schema.properties.n.minimum).toBe(0);
        expect(schema.properties.n.maximum).toBe(10);
    });

    test('z.enum and z.literal', () => {
        const schema = docFor(z.object({ kind: z.enum(['a', 'b', 'c']), pinned: z.literal(true) })) as { properties: { kind: { enum: string[] }; pinned: { enum: boolean[] } } };
        expect(schema.properties.kind.enum).toEqual(['a', 'b', 'c']);
        expect(schema.properties.pinned.enum).toEqual([true]);
    });

    test('z.array and z.tuple', () => {
        const schema = docFor(z.object({ arr: z.array(z.number()), tup: z.tuple([z.string(), z.number()]) })) as {
            properties: { arr: { type: string; items: unknown }; tup: { type: string; items: unknown } };
        };
        expect(schema.properties.arr.type).toBe('array');
        expect(schema.properties.arr.items).toBeDefined();
        expect(schema.properties.tup.type).toBe('array');
    });

    test('z.union and z.discriminatedUnion', () => {
        const schema = docFor(
            z.object({
                anyOf: z.union([z.string(), z.number()]),
                disc: z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), a: z.string() }), z.object({ kind: z.literal('b'), b: z.number() })]),
            }),
        ) as { properties: { anyOf: { anyOf?: unknown[] }; disc: { oneOf?: unknown[] } } };
        expect(Array.isArray(schema.properties.anyOf.anyOf)).toBe(true);
        expect(Array.isArray(schema.properties.disc.oneOf)).toBe(true);
    });

    test('z.optional, z.nullable, z.default — required[] and nullable flags', () => {
        const schema = docFor(z.object({ a: z.string().optional(), b: z.string().nullable(), c: z.string().default('x') })) as {
            properties: { a: unknown; b: { nullable?: boolean }; c: { default?: string } };
            required?: string[];
        };
        expect(schema.required ?? []).not.toContain('a');
        expect(schema.required ?? []).toContain('b');
        expect(schema.required ?? []).not.toContain('c');
        expect(schema.properties.b.nullable).toBe(true);
        expect(schema.properties.c.default).toBe('x');
    });

    test('z.record and nested z.object', () => {
        const schema = docFor(
            z.object({
                map: z.record(z.string(), z.number()),
                nested: z.object({ inner: z.object({ deep: z.string() }) }),
            }),
        ) as { properties: { map: { type: string; additionalProperties?: unknown }; nested: { properties?: { inner?: { properties?: { deep?: { type?: string } } } } } } };
        expect(schema.properties.map.type).toBe('object');
        expect(schema.properties.map.additionalProperties).toBeDefined();
        expect(schema.properties.nested.properties?.inner?.properties?.deep?.type).toBe('string');
    });

    test('z.intersection produces allOf', () => {
        const schema = docFor(z.object({ both: z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })) })) as { properties: { both: { allOf?: unknown[] } } };
        expect(Array.isArray(schema.properties.both.allOf)).toBe(true);
    });

    test('z.coerce types are emitted with the coerced base type', () => {
        const schema = docFor(z.object({ n: z.coerce.number(), b: z.coerce.boolean(), d: z.coerce.date() })) as {
            properties: { n: { type: string }; b: { type: string }; d: { type?: string; format?: string } };
        };
        expect(schema.properties.n.type).toBe('number');
        expect(schema.properties.b.type).toBe('boolean');
    });
});

describe('buildZodOasFragment — components & tags', () => {
    beforeEach(() => _resetRegistry());

    test('every registered schema appears under components.schemas', () => {
        registerSchema('A', z.object({ x: z.string() }));
        registerSchema('B', z.object({ y: z.number() }));
        defineRoute(router(), { method: 'get', path: '/p', responses: { 200: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        expect(Object.keys(fragment.components.schemas ?? {}).sort()).toEqual(['A', 'B']);
    });

    test('tags are derived from operations and de-duplicated within the fragment', () => {
        defineRoute(router(), { method: 'get', path: '/a', tags: ['T1', 'T2'], responses: { 200: { description: 'OK' } }, handler: noop });
        defineRoute(router(), { method: 'post', path: '/b', tags: ['T2', 'T3'], responses: { 200: { description: 'OK' } }, handler: noop });
        const fragment = buildZodOasFragment();
        expect(fragment.tags.map(t => t.name).sort()).toEqual(['T1', 'T2', 'T3']);
    });
});

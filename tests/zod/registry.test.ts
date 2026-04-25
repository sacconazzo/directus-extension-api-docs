import { z, registerSchema, registry, _resetRegistry } from '../../src/zod';

type SchemaDef = { type: 'schema'; schema: { _def: { openapi?: { _internal?: { refId?: string } } } } };

const findSchema = (name: string): SchemaDef | undefined => {
    const found = registry.definitions.find(d => {
        const def = d as SchemaDef;
        return def.type === 'schema' && def.schema?._def.openapi?._internal?.refId === name;
    });
    return found as unknown as SchemaDef | undefined;
};

describe('registry / registerSchema', () => {
    beforeEach(() => _resetRegistry());

    test('returns a schema that parses identically to the input', () => {
        const Source = z.object({ id: z.string() });
        const Registered = registerSchema('Identity', Source);
        expect(Registered.parse({ id: 'abc' })).toEqual({ id: 'abc' });
        expect(() => Registered.parse({})).toThrow();
    });

    test('adds the schema to registry.definitions under the given refId', () => {
        registerSchema('User', z.object({ id: z.string() }));
        expect(findSchema('User')).toBeDefined();
    });

    test('tolerates registering the same name twice (last write wins)', () => {
        registerSchema('Dup', z.object({ a: z.string() }));
        registerSchema('Dup', z.object({ b: z.number() }));
        const found = registry.definitions.filter(d => {
            const def = d as { type?: string; schema?: { _def: { openapi?: { _internal?: { refId?: string } } } } };
            return def.type === 'schema' && def.schema?._def.openapi?._internal?.refId === 'Dup';
        });
        expect(found.length).toBeGreaterThanOrEqual(1);
    });

    test('the singleton is the same module instance across imports', () => {
        registerSchema('Shared', z.object({ id: z.string() }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const again = require('../../src/zod');
        expect(again.registry).toBe(registry);
        expect(again.registry.definitions.length).toBeGreaterThan(0);
    });

    test('_resetRegistry empties every definition', () => {
        registerSchema('A', z.object({ a: z.string() }));
        registerSchema('B', z.object({ b: z.string() }));
        expect(registry.definitions.length).toBeGreaterThanOrEqual(2);
        _resetRegistry();
        expect(registry.definitions.length).toBe(0);
    });

    test('z.openapi() metadata is available after the barrel import', () => {
        const schema = z.string().openapi({ example: 'hello', description: 'a greeting' });
        expect(schema._def.openapi?.metadata?.example).toBe('hello');
        expect(schema._def.openapi?.metadata?.description).toBe('a greeting');
    });

    test('registerSchema preserves complex Zod features (refine, transform, default)', () => {
        const Schema = z.object({
            name: z.string().min(1).default('anon'),
            tags: z.array(z.string()).transform(arr => arr.map(s => s.toLowerCase())),
            even: z.number().refine(n => n % 2 === 0, { message: 'must be even' }),
        });
        const Registered = registerSchema('Complex', Schema);
        expect(Registered.parse({ tags: ['HELLO'], even: 4 })).toEqual({
            name: 'anon',
            tags: ['hello'],
            even: 4,
        });
        expect(() => Registered.parse({ tags: [], even: 3 })).toThrow();
    });

    test('registered schemas can be composed by reference (extend / merge)', () => {
        const Base = registerSchema('Base', z.object({ id: z.string() }));
        const Extended = registerSchema('Extended', Base.extend({ name: z.string() }));
        expect(Extended.parse({ id: '1', name: 'x' })).toEqual({ id: '1', name: 'x' });
        expect(findSchema('Base')).toBeDefined();
        expect(findSchema('Extended')).toBeDefined();
    });
});

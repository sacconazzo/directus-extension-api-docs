import { z, zodValidator } from '../../src/zod';
import type { Request, Response, NextFunction } from 'express';

type MockRes = { status: jest.Mock; json: jest.Mock };

const makeRes = (): MockRes => {
    const res: Partial<MockRes> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as MockRes;
};

const run = (middleware: ReturnType<typeof zodValidator>, req: Partial<Request>) => {
    const res = makeRes();
    const next: jest.MockedFunction<NextFunction> = jest.fn();
    middleware(req as Request, res as unknown as Response, next);
    return { res, next, req };
};

const errorPayload = (res: MockRes) => res.json.mock.calls[0]?.[0] as { message: string; errors: Array<{ path: string; message: string; code: string }> };

describe('zodValidator middleware — happy paths', () => {
    test('forwards next() when no schema is supplied', () => {
        const { next, res } = run(zodValidator({}), { body: { whatever: true } });
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('parses params, query and body and replaces the originals with parsed data', () => {
        const middleware = zodValidator({
            params: z.object({ id: z.string() }),
            query: z.object({ page: z.coerce.number().int() }),
            body: z.object({ email: z.string().email() }),
        });
        const req: Partial<Request> = {
            params: { id: 'u1' } as never,
            query: { page: '2' } as never,
            body: { email: 'a@b.io' },
        };
        const { next, res } = run(middleware, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0]?.[0]).toBeUndefined();
        expect(res.status).not.toHaveBeenCalled();
        expect((req.query as unknown as { page: number }).page).toBe(2);
        expect(req.body).toEqual({ email: 'a@b.io' });
    });

    test('applies Zod defaults when fields are omitted', () => {
        const middleware = zodValidator({
            body: z.object({ role: z.string().default('viewer'), name: z.string() }),
        });
        const { req, next } = run(middleware, { body: { name: 'x' } });
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.body).toEqual({ name: 'x', role: 'viewer' });
    });

    test('respects optional bodies when payload is missing', () => {
        const middleware = zodValidator({
            body: z.object({ note: z.string() }).optional(),
        });
        const { next } = run(middleware, { body: undefined });
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('runs Zod transforms (the handler sees the transformed value)', () => {
        const middleware = zodValidator({
            body: z.object({ tag: z.string().transform(s => s.toLowerCase()) }),
        });
        const { req } = run(middleware, { body: { tag: 'HELLO' } });
        expect((req.body as { tag: string }).tag).toBe('hello');
    });

    test('runs Zod refine and reports the custom message on failure', () => {
        const middleware = zodValidator({
            body: z.object({ even: z.number().refine(n => n % 2 === 0, { message: 'must be even' }) }),
        });
        const { res } = run(middleware, { body: { even: 3 } });
        const payload = errorPayload(res);
        expect(payload.errors[0]?.message).toBe('must be even');
    });

    test('honours discriminatedUnion in body validation', () => {
        const Schema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), a: z.string() }), z.object({ kind: z.literal('b'), b: z.number() })]);
        const middleware = zodValidator({ body: Schema });

        const ok = run(middleware, { body: { kind: 'b', b: 1 } });
        expect(ok.next).toHaveBeenCalled();

        const ko = run(middleware, { body: { kind: 'a', b: 1 } });
        expect(ko.res.status).toHaveBeenCalledWith(400);
    });

    test('validates arrays and coerces inner values', () => {
        const middleware = zodValidator({
            body: z.array(z.coerce.number().int()),
        });
        const { req, next } = run(middleware, { body: ['1', '2', '3'] });
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.body).toEqual([1, 2, 3]);
    });

    test('validates nested objects and reports nested error paths', () => {
        const middleware = zodValidator({
            body: z.object({ user: z.object({ email: z.string().email() }) }),
        });
        const { res } = run(middleware, { body: { user: { email: 'nope' } } });
        const payload = errorPayload(res);
        expect(payload.errors[0]?.path).toBe('/body/user/email');
    });

    test('strict objects reject unknown keys', () => {
        const middleware = zodValidator({
            body: z.object({ a: z.string() }).strict(),
        });
        const { res } = run(middleware, { body: { a: 'x', b: 'y' } });
        expect(res.status).toHaveBeenCalledWith(400);
    });
});

describe('zodValidator middleware — error envelope', () => {
    test('400 envelope shape matches express-openapi-validator (status, message, errors[])', () => {
        const middleware = zodValidator({ body: z.object({ user_id: z.string().uuid() }) });
        const { res, next } = run(middleware, { body: {} });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        const payload = errorPayload(res);
        expect(typeof payload.message).toBe('string');
        expect(payload.message).toMatch(/^request\/body /);
        expect(Array.isArray(payload.errors)).toBe(true);
        expect(payload.errors[0]).toEqual(expect.objectContaining({ path: '/body/user_id', code: 'invalid_type' }));
    });

    test('reports every Zod issue, not just the first', () => {
        const middleware = zodValidator({
            body: z.object({ email: z.string().email(), age: z.number().int().min(18) }),
        });
        const { res } = run(middleware, { body: { email: 'nope', age: 5 } });
        const payload = errorPayload(res);
        const paths = payload.errors.map(e => e.path).sort();
        expect(paths).toEqual(['/body/age', '/body/email']);
    });

    test('validates params before query before body and short-circuits at the first failing slot', () => {
        const middleware = zodValidator({
            params: z.object({ id: z.string().uuid() }),
            query: z.object({ q: z.string().min(1) }),
            body: z.object({ x: z.string() }),
        });
        const { res } = run(middleware, { params: { id: 'nope' } as never, query: {} as never, body: {} });
        const payload = errorPayload(res);
        expect(payload.message).toMatch(/^request\/params /);
        expect(payload.errors.every(e => e.path.startsWith('/params/'))).toBe(true);
    });

    test('preserves the array index in error paths', () => {
        const middleware = zodValidator({
            body: z.object({ tags: z.array(z.string().min(1)) }),
        });
        const { res } = run(middleware, { body: { tags: ['ok', '', 'also ok'] } });
        const payload = errorPayload(res);
        expect(payload.errors[0]?.path).toBe('/body/tags/1');
    });

    test('records the Zod issue code (e.g., too_small, invalid_type)', () => {
        const middleware = zodValidator({ body: z.object({ name: z.string().min(2) }) });
        const { res } = run(middleware, { body: { name: 'x' } });
        const payload = errorPayload(res);
        expect(payload.errors[0]?.code).toBe('too_small');
    });

    test('does not call next() after responding with an error', () => {
        const middleware = zodValidator({ body: z.object({ a: z.string() }) });
        const { next } = run(middleware, { body: {} });
        expect(next).not.toHaveBeenCalled();
    });
});

describe('zodValidator middleware — coercion behaviour', () => {
    test('coerces query strings to numbers', () => {
        const middleware = zodValidator({ query: z.object({ limit: z.coerce.number().int() }) });
        const { req } = run(middleware, { query: { limit: '42' } as never });
        expect((req.query as unknown as { limit: number }).limit).toBe(42);
    });

    test('coerces "true"/"false" strings to booleans', () => {
        const middleware = zodValidator({ query: z.object({ active: z.coerce.boolean() }) });
        // z.coerce.boolean treats any non-empty string as true; we check both.
        const truthy = run(middleware, { query: { active: 'true' } as never });
        expect((truthy.req.query as unknown as { active: boolean }).active).toBe(true);
        const falsy = run(middleware, { query: { active: '' } as never });
        expect((falsy.req.query as unknown as { active: boolean }).active).toBe(false);
    });

    test('rejects un-coercible values with invalid_type', () => {
        const middleware = zodValidator({ query: z.object({ n: z.number() }) });
        const { res } = run(middleware, { query: { n: 'not-a-number' } as never });
        expect(res.status).toHaveBeenCalledWith(400);
        const payload = errorPayload(res);
        expect(payload.errors[0]?.code).toBe('invalid_type');
    });
});

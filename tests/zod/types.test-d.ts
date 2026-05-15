/**
 * Compile-time tests. Executed by `tsc --noEmit` (the lint/test pipeline);
 * any failure here is a build error rather than a runtime expectation.
 */
import express from 'express';
import { z, defineRoute } from '../../src/zod';

const router = express.Router();

const Body = z.object({ email: z.string().email() });
const Query = z.object({ limit: z.coerce.number().int() });
const Params = z.object({ id: z.string().uuid() });

defineRoute(router, {
    method: 'post',
    path: '/users/:id',
    request: { params: Params, query: Query, body: Body },
    responses: { 200: { description: 'OK' } },
    handler: (req, res) => {
        const id: string = req.params.id;
        const limit: number = req.query.limit;
        const email: string = req.body.email;
        // The compiler must accept the inferred shape:
        res.json({ id, limit, email });
    },
});

defineRoute(router, {
    method: 'get',
    path: '/no-schema',
    responses: { 200: { description: 'OK' } },
    handler: (_req, res) => {
        res.json({});
    },
});

// Sanity: the `method` field is constrained to the HTTP verbs we support.
// @ts-expect-error — 'options' is not a permitted verb in our enum
defineRoute(router, { method: 'options', path: '/', responses: { 200: { description: 'OK' } }, handler: (_req, res) => res.json({}) });

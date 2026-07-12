# CLAUDE.md

Operational guide for anyone developing on this repository.

## What it is

Directus endpoint extension that exposes Swagger UI (`/api-docs`) and OpenAPI (`/api-docs/oas`) by merging the Directus core spec with custom definitions from other extensions. Custom definitions can be declared in two ways, both supported in the same project:

1. **YAML** — `oasconfig.yaml` + `oas.yaml` per extension; optional runtime validation via `validate(router, services, schema, paths?)`, which mounts `express-openapi-validator`.
2. **Zod** — `defineEndpoint(id, (route, ctx) => { route({...}) })` is the ergonomic API: it derives the OpenAPI prefix from `id`, exposes `services`/`getSchema` in scope, and internally wraps the SDK's own `defineEndpoint`. `defineRoute(router, {...})` remains as the low-level API for mixed Zod+raw Express cases. Everything is exposed as a named export of the main entry point, alongside `validate`: `import { defineEndpoint, defineRoute, registerSchema, z } from 'directus-extension-api-docs'`.

The two paths merge in `src/index.ts`, in the `GET /oas` route handler: core spec → merge YAML (`config.paths/tags/components`) → merge `buildZodOasFragment()` → optional `filterPaths(publishedTags)`.

## Commands (always `pnpm`)

```
pnpm install
pnpm test         # Jest
pnpm typecheck    # tsc --noEmit (required for the type-tests in tests/zod/types.test-d.ts)
pnpm lint         # eslint
pnpm build        # directus-extension build → single dist/index.js
pnpm dev          # build watch
```

`pnpm test`, `pnpm typecheck`, `pnpm lint` must all pass cleanly before committing.

## Source architecture

```
src/
├── index.ts        Directus entry point. Exports { id, validate, handler }.
│                   The /oas handler merges core + YAML + Zod fragment in this order.
├── utils.ts        getConfig (scans YAML), getOas/getOasAll, merge(), filterPaths(), getPackage().
├── types.ts        YAML types (oasConfig, oas).
└── zod/            Sub-module: its symbols are re-exported as named exports from src/index.ts.
    ├── index.ts    Barrel: runs extendZodWithOpenApi(z); public export.
    ├── registry.ts OpenAPIRegistry singleton; registerSchema; _resetRegistry (test only).
    ├── validate.ts zodValidator middleware: safeParse params→query→body, 400 error envelope.
    ├── openapi.ts  buildZodOasFragment(): registry → {paths, components, tags}.
    ├── route.ts    defineRoute(): registry.registerPath + mounts middleware on the Express router.
    └── endpoint.ts defineEndpoint(id, setup): wrapper returning {id, handler}, handles the `/<id>` prefix,
                    and exposes a curried route() over router+prefix inside the setup callback.
```

Reuse `merge()` and `filterPaths()` from `utils.ts`. Don't reinvent deep-merge or tag filtering.

## Gotchas (non-obvious things that waste time)

- **Single-file build.** `directus-extension build` (an SDK rollup wrapper) bundles `src/index.ts` together with all local imports (including `src/zod/*`) into a single `dist/index.js`. npm dependencies (`zod`, `@asteasolutions/zod-to-openapi`, `swagger-ui-express`, ...) are required at runtime. Don't add a separate build step to emit `dist/zod/*` — the Zod symbols are exposed as named exports of `src/index.ts`.
- **`@directus/extensions-sdk` is ESM.** Jest+ts-jest can't load it in a CommonJS context. Tests that load `src/index.ts` must mock it: `jest.mock('@directus/extensions-sdk', () => ({ defineEndpoint: (h: unknown) => h }))`.
- **`getConfig()` reads from `process.cwd()` at module-load time of `src/index.ts`.** To test different YAML fixtures, set up `jest.spyOn(process, 'cwd')` **before** the first `require('../../src/index')`. ESM `import` is hoisted and breaks the ordering — use an explicit module-level `require()` in the test instead.
- **`OpenAPIRegistry` singleton.** `registry.definitions` is a **getter** that returns a new array (`[...parents, ..._definitions]`); mutating it doesn't reset the state. `_resetRegistry()` mutates the private `_definitions` field.
- **Zod version.** Direct dep is `zod ^3.x`. `@directus/extensions-sdk` transitively drags in `zod@4` with `.d.cts` files that require TS ≥ 5 to parse — the TypeScript `^5.x` devDependency is mandatory. Don't move to `zod` 4 on your own: `@asteasolutions/zod-to-openapi` 7.x only supports Zod 3.
- **Shared error envelope.** Both `validate()` (via `express-openapi-validator`) and `zodValidator` respond with `400 { message, errors:[{path, message, code}] }`. `path` has the form `/body/field`, `/params/id`, `/query/limit`. Changing this shape is breaking — update both code paths and their tests together.
- **`useAuthentication`.** When `false` (default), the `/oas` handler forces `accountability = { admin: true }` regardless of `req.accountability`. To test the gate on custom path injection you need a fixture with `useAuthentication: true`.

## Tests

```
tests/
├── index.test.ts             YAML scan, getConfig, merge, filterPaths, bundle support
├── zod/
│   ├── registry.test.ts      singleton, .openapi(), reset, complex Zod, extend
│   ├── validate.test.ts      happy paths, error envelope, coercion
│   ├── route.test.ts         every verb (test.each), options, sync/async errors
│   ├── openapi.test.ts       shape, every Zod feature, OAS 3.0 validation
│   ├── integration.test.ts   YAML+Zod merge, filterPaths on Zod, tag dedup, empty registry
│   └── types.test-d.ts       compile-time (checked by tsc --noEmit), includes @ts-expect-error
└── legacy/
    ├── validate.test.ts      express-openapi-validator regression (body, query, paths arg, envelope)
    └── oas-handler.test.ts   /oas regression (YAML merge, info, accountability gate, Zod contributions)

tests/mocks/
├── oasconfig/, customoas/, merge/, bundle/, mixed/   YAML fixtures
├── zod-mixed/                YAML+Zod fixture for integration.test.ts
├── legacy-validate/          fixture for tests/legacy/validate.test.ts
└── legacy-oas/               fixture for tests/legacy/oas-handler.test.ts (useAuthentication: true)
```

Tests use `supertest` + an in-process Express app; no Directus boot involved.

## Playground (real Directus runtime testing)

```
playground/
├── docker-compose.yml         Directus 11 + SQLite, bind-mounts the repo's dist/
├── .gitignore
└── extensions/                Mapped to /directus/extensions
    ├── oasconfig.yaml         Root YAML config + securitySchemes for the Swagger lock
    ├── yaml-demo/             POST /echo, GET /users/:id (path param + 200/404), DELETE /items/:id
    │   ├── package.json
    │   ├── index.js
    │   └── oas.yaml
    ├── zod-demo/              8 routes: GET/POST/PUT/DELETE, discriminatedUnion, security, deprecated, throw
    │   ├── package.json
    │   └── index.js
    └── directus-services-demo/  Zod routes calling UsersService (real SQLite DB)
        ├── package.json
        └── index.js
```

Usage (from the repo root):
```
pnpm build                                              # produces dist/index.js
docker compose -f playground/docker-compose.yml up      # boots Directus on :8055
```

The image is pinned to `directus/directus:11.17.4` (current stable 11.x — Directus 12 hasn't been released yet; 10.x is in ESU).
Then visit `http://localhost:8055/api-docs` (Swagger), `http://localhost:8055/api-docs/oas` (spec), and try the demo routes. `EXTENSIONS_AUTO_RELOAD=true` picks up dist changes without restarting the container — just re-run `pnpm build`. Changes to `playground/extensions/*/index.js` or `oas.yaml` don't need a build, they're picked up on the fly.

The demos import `directus-extension-api-docs` via the bind-mount of `package.json` + `dist/` into `extensions/node_modules/directus-extension-api-docs/` inside the container; no `npm install` is needed on the playground side.

## Conventions

- No new Markdown files unless explicitly requested.
- Update the README in a measured way: the "Zod-first routes (optional)" section stays at the bottom, doesn't replace anything, and doesn't mark YAML as deprecated.
- `noUnusedLocals` / `noUncheckedIndexedAccess` are enabled in tsconfig: use `?.`, `??`, and the `_` prefix for unused parameters.
- Commit messages: follow the repo's existing style (`feat:`, `fix:`, `docs:`, ...).

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1] - 2026-05-17

Docs-only patch release: aligns the package documentation with public OSS
conventions. No runtime, API, or dependency changes vs. [3.0.0]; users on
3.0.0 do not need to upgrade for functionality.

### Added

- `CONTRIBUTING.md` — setup (`pnpm install`), scripts (`pnpm test` /
  `typecheck` / `lint` / `build` / `dev`), playground walkthrough, PR
  conventions, and pointer to `SECURITY.md`.
- `SECURITY.md` — private vulnerability reporting via GitHub Security
  Advisories; supported version line stated as `3.x`.

### Changed

- README: shields.io badges (npm version, monthly downloads, license),
  table of contents, "YAML vs Zod" guidance section to help users pick
  between the two pipelines introduced in [3.0.0], and a footer with
  Contributing / Reporting issues / License sections linking the new files.
- README intro: replaced the vague "Compatible with latest Directus
  versions" line with the explicit range `^9 || ^10 || ^11`, matching
  `directus:extension.host` in `package.json`.

## [3.0.0] - 2026-05-14

A major release introducing a **Zod-first route definition pipeline** that lives
alongside the existing YAML one. Every README-documented usage from 2.3.x keeps
working unchanged — the major bump reflects the new public API surface, the
bundled runtime dependencies, and a small CJS-interop shape change (see
*Compatibility* below).

### Added

- **Zod-first route definitions.** Declare a route once with Zod schemas and
  obtain three things at no extra cost:
    1. an OpenAPI fragment merged into the same `/api-docs/oas` document;
    2. per-route runtime validation with the same `{ message, errors[] }`
       envelope as `express-openapi-validator`;
    3. typed `req.params` / `req.query` / `req.body` via `z.infer`.

    New named exports of the package main:

    | Export                 | Purpose                                                              |
    |------------------------|----------------------------------------------------------------------|
    | `defineEndpoint`       | Declarative wrapper for a Directus endpoint extension (recommended)  |
    | `defineRoute`          | Lower-level route registration when you already have your own router |
    | `registerSchema`       | Declare a reusable schema as `components.schemas.<name>` (emits `$ref`) |
    | `z`                    | Re-exported zod extended with `.openapi()` metadata                  |
    | `zodValidator`         | Per-slot validation middleware (for advanced use)                    |
    | `registry`             | Singleton `OpenAPIRegistry` from `@asteasolutions/zod-to-openapi`    |
    | `buildZodOasFragment`  | Materialise the registry into `{paths, components, tags}`           |

    The recommended shape:

    ```js
    const { defineEndpoint, z, registerSchema } = require('directus-extension-api-docs');

    module.exports = defineEndpoint('my-id', (route, { services, getSchema }) => {
        route({
            method: 'post',
            path: '/hello',
            request: { body: z.object({ name: z.string().min(1) }) },
            responses: { 200: { description: 'OK' } },
            handler: (req, res) => res.json({ message: `hi ${req.body.name}` }),
        });
    });
    ```

    `defineEndpoint` derives the OpenAPI prefix from `id` and replaces the
    boilerplate of importing `defineEndpoint` from `@directus/extensions-sdk`
    plus wrapping `defineRoute(router, ...)` calls inside it.

- `prefix` option on `defineRoute` to align the OpenAPI path with Directus's
  `/{extension-id}` mount when using the lower-level helper.
- Marketplace metadata:
    - new `directus-extension-endpoint` keyword;
    - `bugs.url`, `engines.node ">=18"`;
    - `directus:extension.host` expanded from `^9.19.2` to
      `^9.0.0 || ^10.0.0 || ^11.0.0` (current major plus the 10.x ESU line).
- Docker-based runtime playground under `playground/` (Directus `11.17.4` +
  SQLite) with three demo extensions:
    - `yaml-demo` — legacy YAML + `validate()` (POST, GET-with-param, DELETE);
    - `zod-demo` — `defineRoute` with prefix, security, deprecated,
      `discriminatedUnion`, error forwarding;
    - `directus-services-demo` — Zod routes calling `UsersService` against the
      real DB.
- New README section "Zod-first routes (optional)".
- Comprehensive test coverage: 112 unit and integration tests (was ~25), with
  dedicated regression suites for the legacy `validate()` function and the
  `/oas` handler.

### Changed

- The build now emits a single `dist/index.js` (~135 KB) with named exports
  alongside the default — same single-file pattern as 2.3.x, just with more
  symbols.
- `validate(router, services, schema, paths?)`: the `paths` parameter is now
  typed as optional (it was already optional at runtime; the type signature
  was incorrect).
- Runtime dependencies added (bundled into `dist/index.js`):
  `zod ^3.25.76`, `@asteasolutions/zod-to-openapi ^7.3.4`.
- DevDep updates: `@directus/extensions-sdk` `^17.1.4`, `@directus/types`
  `^15.0.3`, `typescript` `^5.9.3` (required to parse zod 4's `.d.cts` files
  transitively pulled by the SDK), `@typescript-eslint/*` `^8`,
  `eslint-config-prettier` `^10`, `eslint-plugin-prettier` `^5`,
  `prettier` `^3`, `@types/node` `^22` (LTS), `pinia` `^3`, `pino` `^10`.
- Project guide added (`CLAUDE.md`) for contributors.

### Compatibility

- **No change required for users on 2.3.x**. The full YAML pipeline still
  works: `oasconfig.yaml`, per-extension `oas.yaml`, root and bundle scans,
  legacy `endpoints/` layout, `useAuthentication`, `publishedTags`,
  `filterPaths`, `merge`.
- `const { validate } = require('directus-extension-api-docs')` keeps working
  exactly as before.
- Directus loads the extension via `require(...).default || require(...)` —
  unchanged.

## [2.3.4] - 2026-04-24

### Fixed

- Pin Node.js to 20.20.2 via `.npmrc`.

## Earlier

For releases before 2.3.4 see the [Git history](https://github.com/sacconazzo/directus-extension-api-docs/commits/main).

[Unreleased]: https://github.com/sacconazzo/directus-extension-api-docs/compare/v3.0.1...HEAD
[3.0.1]: https://github.com/sacconazzo/directus-extension-api-docs/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/sacconazzo/directus-extension-api-docs/releases/tag/v3.0.0
[2.3.4]: https://github.com/sacconazzo/directus-extension-api-docs/releases/tag/v2.3.4

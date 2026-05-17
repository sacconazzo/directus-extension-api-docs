# Contributing

Thanks for your interest in improving `directus-extension-api-docs`.

## Setup

Requirements: Node.js `>=18`, [pnpm](https://pnpm.io/).

```
pnpm install
```

## Scripts

```
pnpm test         # Jest test suite
pnpm typecheck    # tsc --noEmit (required for tests/zod/types.test-d.ts)
pnpm lint         # ESLint
pnpm build        # produces dist/index.js
pnpm dev          # watch build
```

`pnpm test`, `pnpm typecheck`, and `pnpm lint` must pass before submitting a PR.

## Trying changes in a real Directus

A Docker-based playground (Directus 11 + SQLite, three demo extensions) lives under [`playground/`](./playground):

```
pnpm build
docker compose -f playground/docker-compose.yml up
```

Then `http://localhost:8055/api-docs`. `EXTENSIONS_AUTO_RELOAD=true` reloads `dist/` without restarting the container — just rerun `pnpm build`.

## Pull requests

-   Open issues for non-trivial changes before sending a PR, so we can align on the approach.
-   Keep PRs focused; one logical change per PR.
-   Update [`CHANGELOG.md`](./CHANGELOG.md) under `[Unreleased]` when the change is user-visible.
-   Commit messages follow the existing style: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.

## Reporting issues

Bug reports and feature requests: [GitHub issues](https://github.com/sacconazzo/directus-extension-api-docs/issues). Please include Directus version, Node version, and a minimal reproduction when possible.

For security vulnerabilities see [SECURITY.md](./SECURITY.md).

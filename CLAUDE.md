# CLAUDE.md

Guida operativa per chi sviluppa su questo repository.

## Cos'è

Directus endpoint extension che espone Swagger UI (`/api-docs`) e OpenAPI (`/api-docs/oas`) mergiando lo spec core di Directus con le definizioni custom delle altre extension. Le definizioni custom possono essere dichiarate in due modi, supportati nello stesso progetto:

1. **YAML** — `oasconfig.yaml` + `oas.yaml` per extension; validazione runtime opzionale tramite `validate(router, services, schema, paths?)` che monta `express-openapi-validator`.
2. **Zod** — `defineEndpoint(id, (route, ctx) => { route({...}) })` è l'API ergonomica: deriva il prefix OpenAPI da `id`, espone `services`/`getSchema` nello scope e wrappa internamente il `defineEndpoint` del SDK. `defineRoute(router, {...})` resta come API low-level per casi misti Zod+Express raw. Tutto esposto come named export del main, accanto a `validate`: `import { defineEndpoint, defineRoute, registerSchema, z } from 'directus-extension-api-docs'`.

Le due strade si fondono in `src/index.ts`, route handler `GET /oas`: core spec → merge YAML (`config.paths/tags/components`) → merge `buildZodOasFragment()` → eventuale `filterPaths(publishedTags)`.

## Comandi (sempre `pnpm`)

```
pnpm install
pnpm test         # Jest
pnpm typecheck    # tsc --noEmit (richiesto per i type-test in tests/zod/types.test-d.ts)
pnpm lint         # eslint
pnpm build        # directus-extension build → singolo dist/index.js
pnpm dev          # build watch
```

`pnpm test`, `pnpm typecheck`, `pnpm lint` devono passare puliti prima di committare.

## Architettura sorgenti

```
src/
├── index.ts        Entry point Directus. Esporta { id, validate, handler }.
│                   Handler /oas mergia core + YAML + fragment Zod in quest'ordine.
├── utils.ts        getConfig (scan YAML), getOas/getOasAll, merge(), filterPaths(), getPackage().
├── types.ts        Tipi YAML (oasConfig, oas).
└── zod/            Sotto-modulo: i suoi simboli sono ri-esportati come named exports da src/index.ts.
    ├── index.ts    Barrel: esegue extendZodWithOpenApi(z); export pubblico.
    ├── registry.ts Singleton OpenAPIRegistry; registerSchema; _resetRegistry (test only).
    ├── validate.ts zodValidator middleware: safeParse params→query→body, envelope errori 400.
    ├── openapi.ts  buildZodOasFragment(): registry → {paths, components, tags}.
    ├── route.ts    defineRoute(): registry.registerPath + montaggio middleware su router Express.
    └── endpoint.ts defineEndpoint(id, setup): wrapper che ritorna {id, handler}, cura prefix `/<id>`,
                    ed espone `route()` curried su router+prefix dentro lo setup callback.
```

Riusa `merge()` di `utils.ts` e `filterPaths()` di `utils.ts`. Non reinventare deep-merge o filtro tag.

## Gotcha (cose non ovvie che bruciano tempo)

- **Build single-file.** `directus-extension build` (rollup del SDK) bundla `src/index.ts` con tutti gli import locali (incluso `src/zod/*`) in un unico `dist/index.js`. Le dipendenze npm (`zod`, `@asteasolutions/zod-to-openapi`, `swagger-ui-express`, ...) sono richieste a runtime. Non aggiungere step di build separati per emettere `dist/zod/*` — i simboli Zod sono esposti come named exports di `src/index.ts`.
- **`@directus/extensions-sdk` è ESM.** Jest+ts-jest non lo carica in contesto CommonJS. I test che caricano `src/index.ts` devono mockarlo: `jest.mock('@directus/extensions-sdk', () => ({ defineEndpoint: (h: unknown) => h }))`.
- **`getConfig()` legge da `process.cwd()` al module-load di `src/index.ts`.** Per testare diverse fixture YAML, montare `jest.spyOn(process, 'cwd')` **prima** del primo `require('../../src/index')`. ESM `import` viene hoistato e rompe l'ordine — usare `require()` esplicito al module level del test.
- **Singleton `OpenAPIRegistry`.** `registry.definitions` è un **getter** che ritorna un nuovo array `[...parents, ..._definitions]`; mutarlo non resetta lo stato. `_resetRegistry()` muta `_definitions` (campo privato).
- **Zod versione.** Direct dep `zod ^3.x`. `@directus/extensions-sdk` trascina transitivamente `zod@4` con `.d.cts` che richiedono TS ≥ 5 per essere parsati — devDep TypeScript `^5.x` è obbligatoria. Non passare a `zod` 4 sul proprio: `@asteasolutions/zod-to-openapi` 7.x supporta solo Zod 3.
- **Envelope errori comune.** Sia `validate()` (via `express-openapi-validator`) sia `zodValidator` rispondono `400 { message, errors:[{path, message, code}] }`. `path` ha forma `/body/field`, `/params/id`, `/query/limit`. Cambiare la shape è breaking — modificare in coppia entrambi i percorsi e i test.
- **`useAuthentication`.** Quando `false` (default), il handler `/oas` forza `accountability = { admin: true }` indipendentemente da `req.accountability`. Per testare il gate sull'iniezione path custom serve fixture con `useAuthentication: true`.

## Test

```
tests/
├── index.test.ts             scan YAML, getConfig, merge, filterPaths, bundle support
├── zod/
│   ├── registry.test.ts      singleton, .openapi(), reset, complex Zod, extend
│   ├── validate.test.ts      happy paths, error envelope, coercion
│   ├── route.test.ts         tutti i verbi (test.each), opzioni, errori sync/async
│   ├── openapi.test.ts       shape, ogni feature Zod, validazione OAS 3.0
│   ├── integration.test.ts   merge YAML+Zod, filterPaths su Zod, dedup tag, registry vuoto
│   └── types.test-d.ts       compile-time (verificato da tsc --noEmit), include @ts-expect-error
└── legacy/
    ├── validate.test.ts      regressione express-openapi-validator (body, query, paths arg, envelope)
    └── oas-handler.test.ts   regressione /oas (merge YAML, info, accountability gate, contributi Zod)

tests/mocks/
├── oasconfig/, customoas/, merge/, bundle/, mixed/   fixture YAML
├── zod-mixed/                fixture YAML+Zod per integration.test.ts
├── legacy-validate/          fixture per tests/legacy/validate.test.ts
└── legacy-oas/               fixture per tests/legacy/oas-handler.test.ts (useAuthentication: true)
```

I test usano `supertest` + Express in-process; nessun boot di Directus.

## Playground (test runtime in Directus reale)

```
playground/
├── docker-compose.yml         Directus 11 + SQLite, bind-mount del dist/ del repo
├── .gitignore
└── extensions/                Mappato su /directus/extensions
    ├── oasconfig.yaml         Config YAML root + securitySchemes per il lock in Swagger
    ├── yaml-demo/             POST /echo, GET /users/:id (path param + 200/404), DELETE /items/:id
    │   ├── package.json
    │   ├── index.js
    │   └── oas.yaml
    ├── zod-demo/              8 rotte: GET/POST/PUT/DELETE, discriminatedUnion, security, deprecated, throw
    │   ├── package.json
    │   └── index.js
    └── directus-services-demo/  Rotte Zod che chiamano UsersService (DB SQLite reale)
        ├── package.json
        └── index.js
```

Uso (dalla root del repo):
```
pnpm build                                              # produce dist/index.js
docker compose -f playground/docker-compose.yml up      # boot Directus su :8055
```

L'image è pinnata a `directus/directus:11.17.4` (current stable 11.x — Directus 12 non è ancora rilasciato; 10.x è in ESU).
Poi `http://localhost:8055/api-docs` (Swagger), `http://localhost:8055/api-docs/oas` (spec), e prova le rotte demo. `EXTENSIONS_AUTO_RELOAD=true` rilegge dist senza restart del container — basta rifare `pnpm build`. Modifiche a `playground/extensions/*/index.js` o `oas.yaml` non richiedono build, vengono prese al volo.

I demo importano `directus-extension-api-docs` via il bind-mount di `package.json` + `dist/` su `extensions/node_modules/directus-extension-api-docs/` dentro il container; nessun `npm install` lato playground è necessario.

## Convenzioni

- Niente nuovi file Markdown a meno che esplicitamente richiesto.
- Aggiornamenti al README in modo misurato: la sezione "Zod-first routes (optional)" sta in fondo, non sostituisce niente, non marca YAML come deprecato.
- `noUnusedLocals` / `noUncheckedIndexedAccess` attivi in tsconfig: usare `?.`, `??`, e prefisso `_` per parametri non usati.
- Commit message: stile esistente del repo (`feat:`, `fix:`, `docs:`, ...).

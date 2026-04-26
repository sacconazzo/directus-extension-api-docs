# CLAUDE.md

Guida operativa per chi modifica questo repository. Tieni questo file allineato quando cambi build, test setup o l'architettura della doppia pipeline YAML/Zod.

## Cos'è

Directus endpoint extension che espone Swagger UI (`/api-docs`) e OpenAPI (`/api-docs/oas`) mergiando lo spec core di Directus con le definizioni custom delle altre extension. Le definizioni custom possono arrivare da **due percorsi paralleli**, entrambi supportati nello stesso progetto:

1. **YAML legacy** — `oasconfig.yaml` + `oas.yaml` per extension, validazione runtime via `validate(router, services, schema, paths?)` che monta `express-openapi-validator`.
2. **Zod-first** (subpath `directus-extension-api-docs/zod`) — `defineRoute(router, {...})` registra path nel registry, valida con un middleware proprio, e contribuisce all'OpenAPI dello stesso `/oas`.

Le due pipeline si fondono in `src/index.ts`, route handler `GET /oas`: core spec → merge YAML (`config.paths/tags/components`) → merge `buildZodOasFragment()` → eventuale `filterPaths(publishedTags)`.

## Comandi (sempre `pnpm`)

```
pnpm install
pnpm test         # Jest, 110 test su 8 suite
pnpm typecheck    # tsc --noEmit (necessario per i test compile-time in tests/zod/types.test-d.ts)
pnpm lint         # eslint
pnpm build        # directus-extension build (dist/index.js) + tsc -p tsconfig.lib.json (dist/zod/*)
pnpm dev          # build watch
```

`pnpm test`, `pnpm typecheck`, `pnpm lint` devono passare puliti prima di qualsiasi commit.

## Architettura sorgenti

```
src/
├── index.ts        Entry point Directus. Esporta { id, validate, handler }.
│                   Handler `/oas` mergia core+YAML+Zod fragment in quest'ordine.
├── utils.ts        getConfig (scan YAML), getOas/getOasAll, merge(), filterPaths(), getPackage().
├── types.ts        Tipi YAML (oasConfig, oas).
└── zod/            Sotto-modulo pubblicato come subpath ./zod
    ├── index.ts    Barrel: esegue extendZodWithOpenApi(z); export pubblico.
    ├── registry.ts Singleton OpenAPIRegistry; registerSchema; _resetRegistry (test only).
    ├── validate.ts zodValidator middleware: safeParse params→query→body, envelope errori 400.
    ├── openapi.ts  buildZodOasFragment(): registry → {paths, components, tags}.
    └── route.ts    defineRoute(): registry.registerPath + montaggio middleware su router Express.
```

Riusa `merge()` di `utils.ts:180` e `filterPaths()` di `utils.ts:64`. Non reinventare deep-merge o filtro tag.

## Gotcha (cose non ovvie che bruciano tempo)

- **Doppio target di build.** `directus-extension build` bundle solo `src/index.ts` → `dist/index.js`. Il sotto-modulo `src/zod/*` non viene bundlato dal SDK; lo compila `tsc -p tsconfig.lib.json` in `dist/zod/*.{js,d.ts}`. Subpath export configurato in `package.json#exports["./zod"]`.
- **`@directus/extensions-sdk` è ESM.** Jest+ts-jest non lo carica in contesto CommonJS. I test che caricano `src/index.ts` (`tests/legacy/*`) devono mockarlo: `jest.mock('@directus/extensions-sdk', () => ({ defineEndpoint: (h: unknown) => h }))`.
- **`getConfig()` legge da `process.cwd()` al module-load di `src/index.ts`.** Per testare diverse fixture YAML, montare `jest.spyOn(process, 'cwd')` **prima** del primo `require('../../src/index')`. ESM `import` viene hoistato e rompe l'ordine — usare `require()` esplicito al module level del test.
- **Singleton `OpenAPIRegistry`.** `registry.definitions` è un **getter** che ritorna un nuovo array `[...parents, ..._definitions]`; mutarlo non resetta lo stato. `_resetRegistry()` muta `_definitions` (campo privato).
- **Zod versione.** Direct dep `zod ^3.23.8`. `@directus/extensions-sdk` trascina transitivamente `zod@4` con `.d.cts` che richiedono TS ≥ 5 per essere parsati — devDep TypeScript `^5.4.0` è obbligatoria. Non passare a `zod` 4 sul proprio: `@asteasolutions/zod-to-openapi` 7.x supporta solo Zod 3.
- **Envelope errori comune.** Sia `validate()` (via `express-openapi-validator`) sia `zodValidator` rispondono `400 { message, errors:[{path, message, code}] }`. `path` ha forma `/body/field`, `/params/id`, `/query/limit`. Cambiare la shape è breaking — modificare in coppia entrambi i percorsi e i test.
- **`useAuthentication`.** Quando `false` (default), il handler `/oas` forza `accountability = { admin: true }` indipendentemente da `req.accountability`. Per testare il gate sull'iniezione path custom serve fixture con `useAuthentication: true`.

## Test (8 suite, 110 test)

```
tests/
├── index.test.ts             (preesistente, NON modificare: copre scan YAML, getConfig, merge, filterPaths)
├── zod/
│   ├── registry.test.ts      singleton, .openapi(), reset, complex Zod, extend
│   ├── validate.test.ts      19 test: happy paths, error envelope, coercion
│   ├── route.test.ts         18 test: tutti i verbi (test.each), opzioni, errori sync/async
│   ├── openapi.test.ts       21 test: shape, ogni feature Zod, validazione OAS 3.0
│   ├── integration.test.ts   merge YAML+Zod, filterPaths su Zod, dedup tag, registry vuoto
│   └── types.test-d.ts       compile-time (verificato da tsc --noEmit), include @ts-expect-error
└── legacy/
    ├── validate.test.ts      regressione express-openapi-validator (body, query, paths arg, envelope)
    └── oas-handler.test.ts   regressione /oas (merge YAML, info, accountability gate, contributi Zod)

tests/mocks/
├── oasconfig/, customoas/, merge/, bundle/, mixed/   fixture YAML preesistenti
├── zod-mixed/                fixture YAML+Zod per integration.test.ts
├── legacy-validate/          fixture per tests/legacy/validate.test.ts
└── legacy-oas/               fixture per tests/legacy/oas-handler.test.ts (useAuthentication: true)
```

I test usano `supertest` + Express in-process; nessun boot di Directus.

## Convenzioni

- Niente nuovi file Markdown a meno che esplicitamente richiesto.
- README aggiornato in modo **misurato**: la sezione "Zod-first routes (optional)" sta in fondo, non sostituisce niente, non marca YAML come deprecato.
- `noUnusedLocals` / `noUncheckedIndexedAccess` attivi in tsconfig: usare `?.`, `??`, e prefisso `_` per parametri non usati.
- Commit message: stile esistente del repo (`feat:`, `fix:`, ...).

## Branch di sviluppo corrente

`claude/directus-zod-validation-vEKIy` — feature additiva Zod-first già committata e pushata.

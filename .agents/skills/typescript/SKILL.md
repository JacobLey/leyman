---
name: typescript
description: Building TypeScript packages (SWC, tsconfig, ESM)
---

# TypeScript Build

> Compiler docs: [SWC](https://swc.rs/docs/usage/swc-jsc) · [TypeScript](https://www.typescriptlang.org/tsconfig)
> Configs: [`@leyman/configs`](../../../leyman/configs/) (`tsconfig.build.json`, `swcrc.jsonc`) · [`../../../nx.json`](../../../nx.json)

## Typescript usage

All javascript code in this repo should use Typescript. The two exceptions are `bin.mjs` files that are required at the top-level for CLI-deployed packages, and `eslint.config.js` which needs to run pre-build. The logic in both should be trivial.

Typescript usage is strict, enforced both by the compiler (`@leyman/configs/tsconfig.build.json`) and ESLint's type-aware rules. Functions declare their return types (`explicit-function-return-type`, relaxed in tests). Avoid `any` (see [coding-patterns](../coding-patterns/SKILL.md)).

Prefer "chainable" immutable APIs, where each call returns a new instance with an updated type rather than mutating in place (see [mocha-chain](../../../tools/test-chain/mocha-chain/) and [juniper](../../../apps/juniper)).

This repo primarily uses vanilla typescript. Transformers (like babel plugins) are generally avoided until functionality becomes GA. Typescript is capable of handling the most common transforms (like React code).

The general goal is that the path from src -> dist should be fairly obvious. Import aliases are managed via `package.json` rather than `tsconfig` magic.

Compiler, SWC, c8, Biome and Vitest configs live in [`@leyman/configs`](../../../leyman/configs/), which every TypeScript package devDepends on: tsconfigs extend `@leyman/configs/<file>`, and the `tsc`, `tsc-test`, `coverage-report` and `vitest-unit-test` targets pass the file in the package's `node_modules` (SWC and Vitest can't extend a package's config). Like any workspace dependency, each package has its own copy ([`sync-injected`](../nx-tasks-reference/SKILL.md#sync-injected)), so after editing a config run `nx run @leyman/configs:build` before the editor or a tool run outside Nx sees it; Nx tasks run it first. The root `tsconfig.json` and `biome.json` extend `./leyman/configs/...` by path, as the root package installs nothing.

The `tsc` target transpiles `src/` → `dist/` with SWC, then runs `tsc` for type checking and `.d.ts` output, one command after another. `.ts` and `.mts` compile to ESM, `.cts` to CommonJS.

The target output is ESNext, except for a published package whose support floor is older than the running Node.js (below). Frontend JS code will have its own packaging and backwards compatibility support that is implemented separately.

Even at ESNext, SWC rewrites a few constructs using helper functions: `using`/`await using` declarations, and `export *` in CommonJS output. [`swcrc.jsonc`](../../../leyman/configs/swcrc.jsonc) inlines those helpers (`externalHelpers: false`), so a package never needs `@swc/helpers` as a dependency.

## Support floors

The toolchain runs the newest Node.js, while a published package supports the oldest version it can without losing functionality: its floor, the major version of `engines.node` (`>=22`). Everything that decides what source may use follows that one field:

- `tsconfig.json` extends `@leyman/configs/tsconfig.node-<major>.json`, whose `lib` and `target` hold only what that Node.js has, so a newer API is a compile error.
- `@types/node` comes from `catalog:node-<major>` in `pnpm-workspace.yaml`.
- [`swc-compile.sh`](../../../leyman/nx-plugin/scripts/swc-compile.sh) compiles to that version's ES year when the floor is older than the running Node.js.
- A package that needs dispose symbols (`using`, `DisposableStack`) takes floor 24: `tsconfig.node-22.json` leaves out `ESNext.Disposable`, as Node.js 22 lacks them.
- `@leyman/eslint-config` turns off rules that suggest an API the floor lacks (`unicorn/prefer-error-is-error` below 24...), and `n/no-unsupported-features/*` reads `engines` itself.

[`check-package`](../nx-tasks-reference/SKILL.md#check-package) fails when the tsconfig or `@types/node` doesn't match `engines.node`, or when a runtime dependency doesn't support the floor: haywire needs 24 (`Error.isError`), so everything that depends on it at runtime does too. CI's `floor-test` (in `e2e/published-entrypoints`) imports each package on the exact oldest version its `engines.node` allows (`>=24` is 24.0.0, `>=22.12` is 22.12.0), and nightly, `floor-suites` runs each package's own test suites on that version, without coverage. Every floor needs its image in `nodeFloorImages` in `dagger/main.go`, or both fail (see the package's [README](../../../e2e/published-entrypoints/README.md)). No floor is below 22.12.0, the oldest Node.js mocha and vitest start on (they need `require()` of ES modules): a floor CI can't run the tests on isn't tested. Lowering a floor is a minor change; raising one is breaking. A released Go module's floor is its `go` directive, tested by `goFloorTest` (see the [create-package skill](../create-package/SKILL.md)). Private packages have no floor: they extend `tsconfig.build.json` and use `catalog:`.

Every published package also has one TypeScript floor, 6.0, stated here rather than in any manifest. `floor-types` (in `e2e/published-entrypoints`, run by Dagger `Test` on every run) checks it with `typescript-floor` (TypeScript 6.0.2, pinned in the catalog; bump it only when the floor is raised):

- Each package's published declarations (those in its copy in `e2e/published-entrypoints`, exactly what it publishes), with TypeScript 6.0 and the newest `tsc`, as a strict consumer with `skipLibCheck: false`, limited to the `lib` and `target` of its Node.js floor's `tsconfig.node-<major>.json`. It runs in the package's directory, so its floor's `@types/node` resolves, and reports only errors in the package's own files, as `check-package` does.
- Each package's type tests (`tsc -p test`) on TypeScript 6.0. They import the built declarations, as a consumer does; the newest is already checked by `tsc-test`.

Why 6.0: older versions fail the type tests (haywire's `withFactory(() => {})` on a binding that may be `undefined` before 6.0, and juniper's object-schema inference before 5.9), and 6.0 knows the ES2025 `lib` names the Node.js floor tsconfigs use. Lowering it would need those fixed; raising it is breaking.

## TypeScript 6 and 7

`tsc` is TypeScript 7, the native (Go) compiler. TypeScript 7.0 ships no compiler API, so tools that load `typescript` as a library (typescript-eslint, Nx's `@nx/js:typescript-sync` generator) still need TypeScript 6. The catalog runs both side by side, as the TypeScript team recommends:

- `typescript` is an alias of `@typescript/typescript6`: the TypeScript 6 API (its CLI is `tsc6`)
- `@typescript/native` is an alias of `typescript@7`: the `tsc` binary

Every package that compiles TypeScript depends on both. `@nx/js` resolves `typescript` from each project, so the TypeScript 6 alias is needed there too, not just in `@leyman/main`.

ESLint type-checks with TypeScript 6 while `tsc` uses TypeScript 7, and the two can disagree, mostly on generic inference. When an assertion only TypeScript 7 needs is flagged by `no-unnecessary-type-assertion`, keep it with a disable comment saying so. VS Code uses the TypeScript 7 language server (`TypeScriptTeam.native-preview`) from `leyman/main/node_modules/@typescript/native`.

Drop the TypeScript 6 alias once TypeScript 7.1 ships its API and typescript-eslint supports it.

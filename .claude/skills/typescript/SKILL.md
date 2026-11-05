---
name: typescript
description: Building TypeScript packages (SWC, tsconfig, ESM)
---

# TypeScript Build

> Compiler docs: [SWC](https://swc.rs/docs/usage/swc-jsc) · [TypeScript](https://www.typescriptlang.org/tsconfig)
> Configs: [`../../../configs/tsconfig.build.json`](../../../configs/tsconfig.build.json) · [`../../../configs/swcrc.jsonc`](../../../configs/swcrc.jsonc) · [`../../../nx.json`](../../../nx.json)

## Typescript usage

All javascript code in this repo should use Typescript. The two exceptions are `bin.mjs` files that are required at the top-level for CLI-deployed packages, and `eslint.config.js` which needs to run pre-build. The logic in both should be trivial.

Typescript usage is strict, enforced both by the compiler (`configs/tsconfig.build.json`) and ESLint's type-aware rules. Functions declare their return types (`explicit-function-return-type`, relaxed in tests). Avoid `any` (see [coding-patterns](../coding-patterns/SKILL.md)).

Prefer "chainable" immutable APIs, where each call returns a new instance with an updated type rather than mutating in place (see [mocha-chain](../../../tools/test-chain/mocha-chain/) and [juniper](../../../apps/juniper)).

This repo primarily uses vanilla typescript. Transformers (like babel plugins) are generally avoided until functionality becomes GA. Typescript is capable of handling the most common transforms (like React code).

The general goal is that the path from src -> dist should be fairly obvious. Import aliases are managed via `package.json` rather than `tsconfig` magic.

The `tsc` target transpiles `src/` → `dist/` with SWC, then runs `tsc` for type checking and `.d.ts` output, one command after another. `.ts` and `.mts` compile to ESM, `.cts` to CommonJS.

The target output is ESNext, except for a published package whose support floor is older than the running Node.js (below). Frontend JS code will have its own packaging and backwards compatibility support that is implemented separately.

Even at ESNext, SWC rewrites a few constructs using helper functions: `using`/`await using` declarations, and `export *` in CommonJS output. [`configs/swcrc.jsonc`](../../../configs/swcrc.jsonc) inlines those helpers (`externalHelpers: false`), so a package never needs `@swc/helpers` as a dependency.

## Support floors

The toolchain runs the newest Node.js, while a published package supports the oldest version it can without losing functionality: its floor, the major version of `engines.node` (`>=22`). Everything that decides what source may use follows that one field:

- `tsconfig.json` extends `configs/tsconfig.node-<major>.json`, whose `lib` and `target` hold only what that Node.js has, so a newer API is a compile error.
- `@types/node` comes from `catalog:node-<major>` in `pnpm-workspace.yaml`.
- [`scripts/nx/swc-compile.sh`](../../../scripts/nx/swc-compile.sh) compiles to that version's ES year when the floor is older than the running Node.js.
- `@leyman/eslint-config` turns off rules that suggest an API the floor lacks (`unicorn/prefer-error-is-error` below 24...), and `n/no-unsupported-features/*` reads `engines` itself.

[`check-package`](../nx-tasks-reference/SKILL.md#check-package) fails when the tsconfig or `@types/node` doesn't match `engines.node`, or when a runtime dependency doesn't support the floor: haywire needs 24 (`Error.isError`), so everything that depends on it at runtime does too. CI's `floor-test` (in `e2e/published-entrypoints`) imports each package on Node.js 22 when its `engines` allows it. Lowering a floor is a minor change; raising one is breaking. Private packages have no floor: they extend `tsconfig.build.json` and use `catalog:`.

## TypeScript 6 and 7

`tsc` is TypeScript 7, the native (Go) compiler. TypeScript 7.0 ships no compiler API, so tools that load `typescript` as a library (typescript-eslint, Nx's `@nx/js:typescript-sync` generator) still need TypeScript 6. The catalog runs both side by side, as the TypeScript team recommends:

- `typescript` is an alias of `@typescript/typescript6`: the TypeScript 6 API (its CLI is `tsc6`)
- `@typescript/native` is an alias of `typescript@7`: the `tsc` binary

Every package that compiles TypeScript depends on both. `@nx/js` resolves `typescript` from each project, so the TypeScript 6 alias is needed there too, not just in `@leyman/main`.

ESLint type-checks with TypeScript 6 while `tsc` uses TypeScript 7, and the two can disagree, mostly on generic inference. When an assertion only TypeScript 7 needs is flagged by `no-unnecessary-type-assertion`, keep it with a disable comment saying so. VS Code uses the TypeScript 7 language server (`TypeScriptTeam.native-preview`) from `leyman/main/node_modules/@typescript/native`.

Drop the TypeScript 6 alias once TypeScript 7.1 ships its API and typescript-eslint supports it.

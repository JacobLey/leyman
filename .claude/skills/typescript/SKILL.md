---
name: typescript
description: Building TypeScript packages (SWC, tsconfig, ESM)
---

# TypeScript Build

> Compiler docs: [SWC](https://swc.rs/docs/usage/swc-jsc) · [TypeScript](https://www.typescriptlang.org/tsconfig)
> Configs: [`../../../configs/tsconfig.build.json`](../../../configs/tsconfig.build.json) · [`../../../configs/swcrc.jsonc`](../../../configs/swcrc.jsonc) · [`../../../nx.json`](../../../nx.json)

## Typescript usage

All javascript code in this repo should use Typescript. The two exceptions are `cli.mjs` files that are required at the top-level for CLI-deployed packages, and `eslint.config.js` which needs to run pre-build. The logic in both should be trivial.

Typescript usage is strict, enforced both by the compiler (`configs/tsconfig.build.json`) and ESLint's type-aware rules. Functions declare their return types (`explicit-function-return-type`, relaxed in tests). Avoid `any` (see [coding-patterns](../coding-patterns/SKILL.md)).

Prefer "chainable" immutable APIs, where each call returns a new instance with an updated type rather than mutating in place (see [mocha-chain](../../../tools/test-chain/mocha-chain/) and [juniper](../../../apps/juniper)).

This repo primarily uses vanilla typescript. Transformers (like babel plugins) are generally avoided until functionality becomes GA. Typescript is capable of handling the most common transforms (like React code).

The general goal is that the path from src -> dist should be fairly obvious. Import aliases are managed via `package.json` rather than `tsconfig` magic.

The `tsc` target transpiles `src/` → `dist/` with SWC and runs `tsc` in parallel for type checking and `.d.ts` output. `.ts` and `.mts` compile to ESM, `.cts` to CommonJS.

The target output is usually the latest ESNext. That is generally compatible with what is supported by server JS runtimes like Node. Frontend JS code will have its own packaging and backwards compatibilty support that is implemented separately.

## TypeScript 6 and 7

`tsc` is TypeScript 7, the native (Go) compiler. TypeScript 7.0 ships no compiler API, so tools that load `typescript` as a library (typescript-eslint, Nx's `@nx/js/typescript` plugin) still need TypeScript 6. The catalog runs both side by side, as the TypeScript team recommends:

- `typescript` is an alias of `@typescript/typescript6`: the TypeScript 6 API (its CLI is `tsc6`)
- `@typescript/native` is an alias of `typescript@7`: the `tsc` binary

Every package that compiles TypeScript depends on both. `@nx/js` resolves `typescript` from each project, so the TypeScript 6 alias is needed there too, not just at the root.

ESLint type-checks with TypeScript 6 while `tsc` uses TypeScript 7, and the two can disagree, mostly on generic inference. When an assertion only TypeScript 7 needs is flagged by `no-unnecessary-type-assertion`, keep it with a disable comment saying so. VS Code uses the TypeScript 7 language server (`TypeScriptTeam.native-preview`) from `leyman/main/node_modules/@typescript/native`.

Drop the TypeScript 6 alias once TypeScript 7.1 ships its API and typescript-eslint supports it.

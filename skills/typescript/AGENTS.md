# TypeScript Build

> Compiler docs: [SWC](https://swc.rs/docs/usage/swc-jsc) · [TypeScript](https://www.typescriptlang.org/tsconfig)
> Configs: [`../../tsconfig.build.json`](../../tsconfig.build.json) · [`../../configs/swcrc.jsonc`](../../configs/swcrc.jsonc) · [`../../nx.json`](../../nx.json)

## Typescript usage

All javascript code in this repo should use Typescript. The one exception is `cli.mjs` files that are required at the top-level for CLI-deployed packages.

Typescript usage is strict, enforced both by Typescript itself and eslint's type-based rules. For example keywords like `any` are banned, and functions should declare their output type instead of just inferring.

To encourage type safe code, "chainable" methods (see packages like [mocha-chain](../../tools/mocha-chain/) and [juniper](../../apps/juniper) for examples) should be encouraged. That results in immutable objects (type cannot change implicitly) and instead returns an updated instance with an updated type.

This repo primarily uses vanilla typescript. Transformers (like babel plugins) are generally avoided until functionality becomes GA. Typescript is capable of handling the most common transforms (like React code).

The general goal is that the path from src -> dist should be fairly obvious. Import aliases are managed via `package.json` rather than `tsconfig` magic.

The _actual_ transpilation is handled by SWC, which is generally faster than typescript. That implementation should be opaque to all users. Typescript is still in use for type checking, and actively reporting errors/providing intellisense in the IDE.

The target output is usually the latest ESNext. That is generally compatible with what is supported by server JS runtimes like Node. Frontend JS code will have its own packaging and backwards compatibilty support that is implemented separately.

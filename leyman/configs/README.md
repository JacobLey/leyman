<div style="text-align:center">

# @leyman/configs

Strict TypeScript, SWC, c8, Biome and Vitest configs for TypeScript ESM packages, with a tsconfig for each Node.js support floor.

[![npm package](https://badge.fury.io/js/@leyman%2Fconfigs.svg)](https://www.npmjs.com/package/@leyman/configs)
[![License](https://img.shields.io/npm/l/@leyman/configs.svg)](https://github.com/JacobLey/leyman/blob/main/leyman/configs/LICENSE)

</div>

`@leyman/configs` holds the tool configs that the packages of the [leyman](https://github.com/JacobLey/leyman) monorepo share, published as they are, so another package can use them instead of keeping its own copies. Each tool either extends the installed file or is pointed at it.

There is a TypeScript config for each Node.js support floor. `tsconfig.node-22.json` and `tsconfig.node-24.json` only include the `lib` and `target` that Node.js version has, so code that uses a newer API fails to compile, rather than crashing for users on the oldest supported version. They all turn on strict type checking (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride` and more) and emit declarations for project references. `tsconfig.test.json` type-checks tests against the package's built declarations, the way a consumer sees them, without emitting anything. It sets `rootDir` to the test folder and `outDir` to `dist-test/` beside it, where tests are compiled, so a subpath import such as `"#test/*": "./dist-test/*"` type-checks against the test sources.

The c8 config fails below 100% coverage of lines, statements, functions and branches. The Biome config formats TypeScript, JSON, Markdown and YAML, and leaves linting to ESLint (see [`@leyman/eslint-config`](https://www.npmjs.com/package/@leyman/eslint-config)).

Expect the configs to be strict, and to change between releases (see [Versioning](#versioning)).

## Contents

- [Install](#install)
- [Usage](#usage)
- [Files](#files)
- [Versioning](#versioning)

## Install

```sh
npm i -D @leyman/configs
```

The configs are written for TypeScript 6 or newer (the `ES2025` libs), Biome 2.6, c8 12, `@swc/core` 1.16 and Vitest 5. Install the tools you use; none is a dependency.

## Usage

Each package that uses a config installs this package, so its tools find the files in its own `node_modules`.

### TypeScript

`tsconfig.json` extends the config of the package's support floor, the major version of `engines.node`:

```json
{
  "extends": "@leyman/configs/tsconfig.node-22.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "include": ["src"]
}
```

A package that isn't published, and so has no floor, extends `@leyman/configs/tsconfig.build.json`, which targets `ESNext`. Install `@types/node` with the floor's major version as well, so Node.js's own APIs are held to the floor too.

`test/tsconfig.json` extends the test config and references the package:

```json
{
  "extends": "@leyman/configs/tsconfig.test.json",
  "references": [{ "path": ".." }]
}
```

### Biome

`biome.json` extends it:

```json
{
  "extends": ["@leyman/configs/biome.base.json"]
}
```

Biome resolves the package from the directory of `biome.json`, so the package must be installed there. In a monorepo whose root installs no packages, extend the file by its path instead.

### c8

`.c8rc.json` extends it:

```json
{
  "extends": "@leyman/configs/c8rc.json"
}
```

Or pass it to c8 directly: `c8 -c node_modules/@leyman/configs/c8rc.json`.

### SWC and Vitest

Neither extends a config from a package, so pass the installed file:

```sh
swc src -d dist --config-file node_modules/@leyman/configs/swcrc.jsonc
vitest run --config node_modules/@leyman/configs/vitest.config.js --root .
```

## Files

| File                    | What it is                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.build.json`   | Strict compiler options for source, `ESNext`, with `composite` and declarations only (SWC emits the JavaScript). Excludes declarations under `dist`, `coverage` and `nyc`.                                                                                                  |
| `tsconfig.node-22.json` | `tsconfig.build.json` limited to Node.js 22: `ES2024`, plus the Set methods, iterator helpers and `Array.fromAsync` it has.                                                                                                                                                 |
| `tsconfig.node-24.json` | `tsconfig.build.json` limited to Node.js 24: `ES2025`, plus `Array.fromAsync`, `using` with `DisposableStack`, and `Error.isError`.                                                                                                                                         |
| `tsconfig.test.json`    | `tsconfig.build.json` without emitting or `composite`, for tests.                                                                                                                                                                                                           |
| `swcrc.jsonc`           | TypeScript and TSX to `esnext` ESM (`nodenext` modules), with source maps, import attributes kept, React's automatic runtime and helpers inlined, so `@swc/helpers` is never a dependency.                                                                                  |
| `c8rc.json`             | 100% thresholds on every metric; HTML, lcov and summary reports; tests, configs and declarations excluded.                                                                                                                                                                  |
| `biome.base.json`       | Formatting only: 4 spaces, single quotes, width 100 for JavaScript and TypeScript; 2 spaces for JSON; Markdown and YAML. Linting off. Follows `.gitignore`. Changelogs are left alone. Not named `biome.json`, which Biome would take as the config of the folder it is in. |
| `vitest.config.js`      | Runs compiled tests from `dist-test/unit` in worker threads (so c8 sees their coverage), with hooks in registration order and native `import` instead of Vite's module runner.                                                                                              |

## Versioning

Before 1.0, a release that can make passing code fail (a stricter compiler option, a higher threshold, a formatting change) is a minor, and other changes are patches.

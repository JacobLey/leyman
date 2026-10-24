<div style="text-align:center">

# barrelify
Generate and CI-verify TypeScript barrel (index.ts) files with the correct ESM/CJS import extensions.

[![npm package](https://badge.fury.io/js/barrelify.svg)](https://www.npmjs.com/package/barrelify)
[![License](https://img.shields.io/npm/l/barrelify.svg)](https://github.com/JacobLey/leyman/blob/main/apps/barrelify/LICENSE)

</div>

- **Specifiers that resolve** — writes `./foo.js`, `./foo.cjs` and `./foo.mjs` (never extensionless paths, and `.tsx` components export as `./Button.js`), so barrels work under Node ESM and TypeScript's `nodenext` resolution.
- **ESM/CJS aware** — reads the nearest `package.json` `"type"` and only re-exports files the index can actually load (a CommonJS index never re-exports `.mts`).
- **Opt-in** — only rewrites `index.ts` files that start with `// AUTO-BARREL`; it never creates files or touches hand-written barrels.
- **CI check** — `barrel --ci` fails when a committed barrel is stale.
- **Keeps type-only exports** — lines you change to `export type *` stay type-only on later runs.

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [barrelify](#barrelifyoptions)
- [CLI](#cli)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i barrelify --save-dev
```

## Example

Given file structure:
```
/
├─┬ cjs
│ ├── package.json // { "type": "commonjs" }
│ ├── cts.cts
│ ├── ts.ts
│ ├── esm.mts
│ └── index.ts // AUTO-BARREL
├─┬ esm
│ ├── package.json // { "type": "module" }
│ ├── cts.cts
│ ├── ts.ts
│ ├── esm.mts
│ └── index.ts // AUTO-BARREL
└─┬ ignore
  ├── foo.ts
  └── index.ts // _not_ AUTO-BARREL
```

`npx barrelify` rewrites:

/cjs/index.ts:
```ts
// AUTO-BARREL

export * from './cts.cjs';
export * from './ts.js';
```

/esm/index.ts:
```ts
// AUTO-BARREL

export * from './cts.cjs';
export * from './esm.mjs';
export * from './ts.js';
```

The `// AUTO-BARREL` comment is preserved so subsequent runs stay in sync.

## Usage

`barrelify` is an ESM module. It _must_ be `import`ed. To load from a CJS module, use dynamic import: `const { barrelify } = await import('barrelify');`.

It is also available as a CLI via `npx barrel` or `npx barrelify`.

Mark any `index.ts` (or `index.tsx`, `index.cts`, `index.mts`) file you want managed with `// AUTO-BARREL` as the very first characters in the file. Barrelify will not create new index files — it only rewrites files that are already opted in. Each barrel re-exports its sibling `.ts`, `.cts`, `.mts` and `.tsx` files, sorted by name (if `foo.ts` and `foo.tsx` both exist, `./foo.js` is exported once). Subdirectories are only re-exported when the marker is `// AUTO-BARREL subdirectories`: then each subdirectory with its own index file is exported as `export * from './sub/index.js';`. Declaration files (`.d.ts`) are skipped. `.tsx` files follow the same ESM/CJS rules as `.ts`, and are exported as `.js`, matching TypeScript's `react-jsx` output.

To re-export a file's types only, change its line to `export type * from './foo.js';`. Barrelify keeps it type-only when it rewrites the file.

Which siblings are exported depends on the barrel's own extension and the `"type"` of the nearest `package.json` (a nested `package.json` changes it for the folders below; a malformed one is an error). `.ts` and `.tsx` are ESM only when `"type": "module"`; `.mts` is always ESM and `.cts` always CommonJS. A CommonJS barrel can't `require` ESM, so:

| Barrel | `"type": "module"` | `"type": "commonjs"` or unset |
|--------|--------------------|-------------------------------|
| `index.ts`, `index.tsx` | `.ts`, `.tsx`, `.cts`, `.mts` | `.ts`, `.tsx`, `.cts` |
| `index.mts` | `.ts`, `.tsx`, `.cts`, `.mts` | `.ts`, `.tsx`, `.cts`, `.mts` |
| `index.cts` | `.cts` | `.ts`, `.tsx`, `.cts` |

To export a `.mts` file from a package that is CommonJS, rename the barrel to `index.mts`.

Always ignores `.gitignore`-d paths and `node_modules`. Barrel files should be checked into version control.

## API

### `barrelify(options?)`

Programmatic entry point. Scans for `// AUTO-BARREL` index files and rewrites them with correct barrel exports.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options` | `BarrelifyOptions` | `{}` | Optional. See [Options](#options). |

**Returns** `Promise<string[]>` — absolute paths of the barrel files that changed (or would change, with `dryRun`).

**Throws** (rejects) `Error` with `Directory not found: <path>` if `cwd` doesn't exist, or if the nearest `package.json` of a barrel is malformed. There is no `ci` option: to check from code, call with `dryRun: true` and fail when the result is not empty.

```ts
import { barrelify } from 'barrelify';

await barrelify({ cwd: './src', ignore: ['**/generated/**'] });
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string \| URL` | `process.cwd()` | Root directory to start searching for index files. Searches recursively. A relative path is resolved from `process.cwd()`, and a file path means its parent directory. |
| `dryRun` | `boolean` | `false` | If `true`, computes barrel output but does not write any files. |
| `ignore` | `readonly string[]` | `[]` | Glob patterns for index files to skip, relative to `cwd`. |

## CLI

```sh
npx barrel [options]
npx barrelify [options]
```

| Flag | Description |
|------|-------------|
| `--ci` | Dry-run mode that prints the out-of-sync barrel files and exits with a non-zero code (error `Barrel files are out of date. Run barrel without --ci to update them`) if there are any. On by default in CI; pass `--no-ci` to write files there. |
| `--cwd <path>` | Root directory to search. Defaults to `process.cwd()`. |
| `--dry-run` | Compute barrel output without writing files. Prints the barrel files that would change. |
| `--ignore <globs...>` | Glob patterns for index files to skip, relative to `--cwd`. |

```sh
npx barrel --ci           # fail if any barrel file is stale
npx barrel --cwd ./src    # limit search to ./src
npx barrel --dry-run      # preview changes without writing
npx barrel --ignore '**/generated/**'
```

## Compared to alternatives

[barrelsby](https://www.npmjs.com/package/barrelsby) and [ctix](https://www.npmjs.com/package/ctix) generate barrels across a directory tree from configuration. barrelify keeps one opt-in marker per file, and no config.

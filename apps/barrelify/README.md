<div style="text-align:center">

# barrelify
Auto-generate TS barrel files.

[![npm package](https://badge.fury.io/js/barrelify.svg)](https://www.npmjs.com/package/barrelify)
[![License](https://img.shields.io/npm/l/barrelify.svg)](https://github.com/JacobLey/leyman/blob/main/apps/barrelify/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [barrelify](#barrelifyoptions)
- [CLI](#cli)
- [Also See](#also-see)

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
export * from './ts.js';
export * from './esm.mjs';
```

The `// AUTO-BARREL` comment is preserved so subsequent runs stay in sync.

## Usage

`barrelify` is an ESM module. It _must_ be `import`ed. To load from a CJS module, use dynamic import: `const { barrelify } = await import('barrelify');`.

It is also available as a CLI via `npx barrel` or `npx barrelify`.

Mark any `index.ts` file you want managed with `// AUTO-BARREL` as the very first characters in the file. Barrelify will not create new index files — it only rewrites files that are already opted in.

Always ignores `.gitignore`-d paths and `node_modules`. Barrel files should be checked into version control.

## API

### `barrelify(options?)`

Programmatic entry point. Scans for `// AUTO-BARREL` index files and rewrites them with correct barrel exports.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options` | `BarrelifyOptions` | `{}` | Optional. See [Options](#options). |

**Returns** `Promise<void>` — resolves when all barrel files have been written.

```ts
import { barrelify } from 'barrelify';

await barrelify({ cwd: './src', ignore: ['**/generated/**'] });
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Root directory to start searching for index files. Searches recursively. |
| `dryRun` | `boolean` | `false` | If `true`, computes barrel output but does not write any files. |
| `ignore` | `string[]` | `[]` | Glob patterns for index files to skip. |

## CLI

```sh
npx barrel [options]
npx barrelify [options]
```

| Flag | Description |
|------|-------------|
| `--ci` | Dry-run mode that exits with a non-zero code if any barrel file is out of sync. Use in CI to verify files were committed. |
| `--cwd <path>` | Root directory to search. Defaults to `process.cwd()`. |
| `--dry-run` | Compute barrel output without writing files. |
| `--ignore <globs...>` | Glob patterns for index files to skip. |

```sh
npx barrel --ci           # fail if any barrel file is stale
npx barrel --cwd ./src    # limit search to ./src
npx barrel --dry-run      # preview changes without writing
npx barrel --ignore '**/generated/**'
```

## Also See

- [barrelify skill](../../skills/packages/barrelify/AGENTS.md) — monorepo conventions and guidance for using barrelify in this repo

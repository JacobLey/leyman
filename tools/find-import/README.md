<div style="text-align:center">

# find-import
Find and load the first matching JS/JSON file by searching parent directories.

[![npm package](https://badge.fury.io/js/find-import.svg)](https://www.npmjs.com/package/find-import)
[![License](https://img.shields.io/npm/l/find-import.svg)](https://github.com/JacobLey/leyman/blob/main/tools/find-import/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [findImport](#findimportfilenames-options)
- [Also See](#also-see)

## Install

```sh
npm i find-import
```

## Example

Given file structure:
```
/
└─┬ root
  ├── my-file.cjs // module.exports = { abc: 123 }
  └─┬ my-package
    └── my-file.json // { "foo": "bar" }
```

```ts
// cwd = /root/my-package
import { findImport } from 'find-import';

// Searches upward from cwd — finds closest match first
const found = await findImport(['my-file.cjs', 'my-file.json']);
found.content;  // { foo: 'bar' }
found.filePath; // /root/my-package/my-file.json

// Search downward — finds top-most match first
const fromTop = await findImport(['my-file.cjs', 'my-file.json'], { direction: 'down' });
fromTop.content;  // { abc: 123 }
fromTop.filePath; // /root/my-file.cjs

// Limit search to a subtree
const scoped = await findImport(['my-file.cjs', 'my-file.json'], {
    direction: 'down',
    startAt: '/root/my-package',
});
scoped.filePath; // /root/my-package/my-file.json
```

## Usage

`find-import` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { findImport } = await import('find-import');`.

Supports `.json`, `.cjs`, `.mjs`, and `.js` files.

## API

### `findImport(fileNames, options?)`

Searches directories for the first matching file from `fileNames` and loads it. By default searches upward from `cwd` to `/`, returning the closest (deepest) match. Returns `null` if no file is found.

The `content` field is the result of a dynamic `import()` call. When importing CJS modules, extracting the default export may require [`default-import`](https://www.npmjs.com/package/default-import).

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fileNames` | `string \| string[]` | — | Required. One or more file names to search for in each directory. |
| `options` | `object` | `{}` | Optional. Search configuration. |
| `options.cwd` | `string \| URL` | `process.cwd()` | Bottom-most directory to begin the search from. |
| `options.direction` | `'up' \| 'down'` | `'up'` | `'up'` searches from `cwd` toward `/` (returns deepest match); `'down'` reverses the order (returns top-most match). |
| `options.startAt` | `string \| URL` | `'/'` | Top-most directory that bounds the search. |

**Returns** `Promise<{ filePath: string; content: unknown } | null>` — the absolute path and loaded content of the first matching file, or `null` if none is found.

## Also See

- [`default-import`](https://www.npmjs.com/package/default-import) — extracts the correct default export from a CJS/ESM import, useful when handling `content` from `findImport`
- [`parse-cwd`](https://www.npmjs.com/package/parse-cwd) — resolves the `cwd` and `startAt` options used by `findImport`

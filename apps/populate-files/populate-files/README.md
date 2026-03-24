<div style="text-align:center">

# populate-files
Populate static files with dynamic content, and make sure they stay in sync.

[![npm package](https://badge.fury.io/js/populate-files.svg)](https://www.npmjs.com/package/populate-files)
[![License](https://img.shields.io/npm/l/populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/tools/populate-files/LICENSE)

</div>

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [populateFile](#populatefileparams-options)
  - [populateFiles](#populatefilesparams-options)
- [Also See](#also-see)

## Install

```sh
npm i populate-files
```

## Example

```ts
import { populateFile } from 'populate-files';

// Successfully writes json file!
await populateFile({
    filePath: './foo.json',
    content: { bar: 123 },
});

// Error! File has changed!
await populateFile(
    {
        filePath: './foo.json',
        content: { baz: 456 },
    },
    {
        check: true,
    }
);
```

## Usage

`populate-files` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { populateFiles } = await import('populate-files');`.

Provide the file path and content, and the file will be written. Optionally specify `check: true` to fail when the file content would change — useful for enforcing that generated files are committed and up to date in CI.

## API

### `populateFile(params, options?)`

Writes the provided content to the file at `params.filePath`.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params` | `object` | — | Required. See [params](#params) below. |
| `options` | `object` | `{}` | Optional. See [options](#options) below. |

**Returns** `Promise<void>`

#### `params`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `filePath` | `string` | — | Required. Path to the file to write (and check for existing content). |
| `content` | `string \| object \| Uint8Array \| Promise` | — | Required. Data to write. Strings and `Uint8Array` (like Buffers) are written literally. An object is `JSON.stringify`ed and pretty-formatted according to user configs. A `Promise` may be provided that resolves to one of these types. |

#### `options`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `check` | `boolean` | `true` in CI, else `false` | If `true`, fails if writing the file would change its content. Useful for CI environments to verify version-controlled files are up to date before deployment. |
| `dryRun` | `boolean` | `false` | If `true`, does not write the file regardless of changes. Can still fail if `check` is `true`. |
| `cwd` | `string \| URL` | `process.env.PWD` | Used as the current working directory when `params.filePath` is a relative path. |

---

### `populateFiles(params, options?)`

Writes multiple files in parallel.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params` | `PopulateFileParams[]` | — | Required. A list of [populateFile params](#params), with unique `filePath`s. |
| `options` | `object` | `{}` | Optional. Same as [populateFile options](#options). |

**Returns** `Promise<void>`

## Also See

- [`load-populate-files`](https://www.npmjs.com/package/load-populate-files) — loads file configs from a separate module and calls `populateFiles` for you
- [`format-file`](https://www.npmjs.com/package/format-file) — used internally to pretty-print stringified file content
- [`parse-cwd`](https://www.npmjs.com/package/parse-cwd) — used internally to interpret the `cwd` option

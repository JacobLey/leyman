<div style="text-align:center">

# load-populate-files
Load and dynamically populate file content based on a single file's config.

[![npm package](https://badge.fury.io/js/load-populate-files.svg)](https://www.npmjs.com/package/load-populate-files)
[![License](https://img.shields.io/npm/l/load-populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/tools/load-populate-files/LICENSE)

</div>

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [loadAndPopulateFiles](#loadandpopulatefilesfilepath-options)
- [Types](#types)
  - [PopulateFileParams](#populatefileparams)
- [Also See](#also-see)

## Install

```sh
npm i load-populate-files
```

## Example

```ts
// config.ts
export default [
    {
        filePath: './foo.json',
        content: { bar: 123 },
    },
    {
        filePath: './abc.js',
        content: `
            console.log('Hello World!');
        `,
    },
];

// index.ts
import { loadAndPopulateFiles } from 'load-populate-files';

await loadAndPopulateFiles('./config.js');
```

## Usage

`load-populate-files` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { loadAndPopulateFiles } = await import('load-populate-files');`.

Instead of calling `populateFiles()` directly, export file configs from a dedicated config module, then point `loadAndPopulateFiles()` at that file. The loaded file may export a single config object or an array of configs.

This package is also available as a CLI:

```sh
pnpx load-populate-files --help
pnpx load-populate-files --file-path ./config.js
```

## API

### `loadAndPopulateFiles(filePath, options?)`

Loads the config exported at `filePath` and passes it to [`populateFiles()`](https://www.npmjs.com/package/populate-files#populatefilesparams-options).

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePath` | `string` | — | Required. Path to the config module. When using the CLI, pass as `--file-path`. |
| `options` | `object` | `{}` | Optional. See [options](#options) below. |

**Returns** `Promise<void>`

#### `options`

Options are passed through to the underlying `populateFiles()` call. They are also available as CLI flags.

| Property | CLI flag | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `check` | `--ci` | `boolean` | `true` in CI, else `false` | If `true`, fails if writing a file would change its content. Useful for verifying version-controlled files are up to date before deployment. |
| `dryRun` | `--dry-run` | `boolean` | `false` | If `true`, does not write any files regardless of changes. Can still fail if `check` is `true`. |
| `cwd` | `--cwd` | `string \| URL` | `process.env.PWD` | Used as the current working directory for `filePath` and re-used for relative `filePath`s in the loaded config. |

## Types

### `PopulateFileParams`

The type of a single exported config entry — equivalent to the params accepted by `populateFiles()`. Use with the `satisfies` keyword to validate your config at compile time.

```ts
import type { PopulateFileParams } from 'load-populate-files';

export default {
    filePath: './foo.json',
    content: { bar: 123 },
} satisfies PopulateFileParams;
```

This type can also be imported directly from [`populate-files`](https://www.npmjs.com/package/populate-files).

## Also See

- [`populate-files`](https://www.npmjs.com/package/populate-files) — the underlying package that writes files; use directly when you don't need a separate config file
- [`parse-cwd`](https://www.npmjs.com/package/parse-cwd) — used internally to interpret the `cwd` option

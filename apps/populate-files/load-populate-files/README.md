<div style="text-align:center">

# load-populate-files
Load and dynamically populate file content based on a single file's config.

[![npm package](https://badge.fury.io/js/load-populate-files.svg)](https://www.npmjs.com/package/load-populate-files)
[![License](https://img.shields.io/npm/l/load-populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/apps/populate-files/load-populate-files/LICENSE)

</div>

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/populate-files/), including [Config modules](https://jacobley.github.io/leyman/packages/populate-files/guides/config-modules) for this package.

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [loadAndPopulateFiles](#loadandpopulatefilesparams-options)
- [Types](#types)
  - [PopulateFileParams](#populatefileparams)
- [Also See](#also-see)

## Install

```sh
npm i load-populate-files
```

## Example

```ts
// config.ts, compiled to config.js
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

await loadAndPopulateFiles({ filePath: './config.js' });
```

## Usage

`load-populate-files` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { loadAndPopulateFiles } = await import('load-populate-files');`.

Instead of calling `populateFiles()` directly, export file configs from a dedicated config module, then point `loadAndPopulateFiles()` at that file. The config module is loaded with `import()`, so it must be JavaScript that Node can run: point at the compiled `.js`, not the `.ts` source. Its default export may be a single config object or an array of configs.

This package is also available as a CLI:

```sh
pnpx load-populate-files --help
pnpx load-populate-files --file-path ./config.js
```

## API

### `loadAndPopulateFiles(params, options?)`

Loads the config exported at `params.filePath` and passes it to [`populateFiles()`](https://www.npmjs.com/package/populate-files#populatefilesparams-options).

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.filePath` | `string` | — | Required. Path to the config module, resolved from `options.cwd`. When using the CLI, pass as `--file-path`. |
| `options` | `object` | `{}` | Optional. See [options](#options) below. |

**Returns** `Promise<PopulationResponse[]>`, from `populateFiles()`.

**Throws** (rejects) `Error` with `JS file not found: <path>` if the module doesn't exist, or with `File content does not fulfill populate-file input at: <path>` followed by a line per problem (e.g. `- 0.filePath: must have required property 'filePath'`) if the default export isn't a valid config. Errors from `populateFiles()` (such as a `PopulateFilesCheckError` with `check`) pass through. The CLI prints the error and exits with code 1.

#### `options`

Options are passed through to the underlying `populateFiles()` call. They are also available as CLI flags.

| Property | CLI flag | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `check` | `--ci`, `--check` (`--no-ci` to write in CI) | `boolean` | `true` in CI, else `false` | If `true`, fails if writing a file would change its content. Useful for verifying version-controlled files are up to date before deployment. |
| `dryRun` | `--dry-run` | `boolean` | `false` | If `true`, does not write any files regardless of changes. Can still fail if `check` is `true`. |
| `cwd` | `--cwd` | `string \| URL` | `process.cwd()` | Used as the current working directory for `filePath` and the `targetDir` and `manifest` paths. Must be an existing directory. |
| `targetDir` | `--target-dir`, `-t` | `string` | `'.'` | Target directory for resolving output file paths. Resolved relative to `cwd`. |
| `clean` | `--clean` | `boolean` | `false` | If `true`, removes files in `targetDir` that were not generated (with `manifest`, only files it lists). In `--ci` mode, fails instead of removing. |
| `force` | `--force` | `boolean` | `false` | Applies to `signed` files and the `manifest`. If `true`, overwrites files that were edited, are not signed or not listed, or are malformed. See [`populate-files`](https://www.npmjs.com/package/populate-files#signed-files). |
| `manifest` | `--manifest` | `string` | — | Path of a manifest (relative to `cwd`) recording the generated files, to detect edits to any file type and `clean` only files it lists. See [`populate-files`](https://www.npmjs.com/package/populate-files#manifest). |

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

Configs may set `signed: true` (with string content) to sign the file and keep its manual sections, see [signed files](https://www.npmjs.com/package/populate-files#signed-files).

## Also See

- [`populate-files`](https://www.npmjs.com/package/populate-files) — the underlying package that writes files; use directly when you don't need a separate config file
- [`parse-cwd`](https://www.npmjs.com/package/parse-cwd) — used internally to interpret the `cwd` option

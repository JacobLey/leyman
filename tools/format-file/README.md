<div style="text-align:center">

# format-file
Format generated files in-place using biome or prettier.

[![npm package](https://badge.fury.io/js/format-file.svg)](https://www.npmjs.com/package/format-file)
[![License](https://img.shields.io/npm/l/format-file.svg)](https://github.com/JacobLey/leyman/blob/main/tools/format-file/LICENSE)

</div>

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [formatFile](#formatfilefilepath-options)
  - [formatFiles](#formatfilesfilepaths-options)
  - [formatText](#formattextcontent-options)

## Install

```sh
npm i format-file
```

Both `@biomejs/biome` and `prettier` are optional peer dependencies. Install at least one:

```sh
npm i @biomejs/biome   # recommended (default in this monorepo)
npm i prettier
```

## Example

```ts
import { formatFile, formatText } from 'format-file';

// Format a file in-place
await formatFile('./generated.ts');
// ./generated.ts is now formatted per your biome/prettier config

// Format a raw text body as JSON
const result = await formatText(
    `{     "abc":123   ,\n     "efg":\n              456}`,
    { ext: '.json' }
);
// result === '{\n  "abc": 123,\n  "efg": 456\n}\n'
```

## Usage

`format-file` is an ESM module. It _must_ be `import`ed. To load from a CJS module, use dynamic import: `const { formatFile } = await import('format-file');`.

Formatting is best-effort. If neither biome nor prettier is installed and configured, files are returned unchanged. It is recommended to produce reasonable output before formatting (e.g. `JSON.stringify(data, null, 2)`), treating formatting as a polish step rather than a correctness requirement.

In this monorepo, `biome` is the default formatter and will be preferred when `formatter` is not specified.

## API

### `formatFile(filePath, options?)`

Formats a file in-place according to the project's formatter configuration.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePath` | `string` | — | Required. Path to the file. Relative paths resolve from `process.cwd()`. |
| `options` | `FileFormatterOptions` | `{}` | Optional. See [FileFormatterOptions](#fileformatteroptions). |

**Returns** `Promise<void>` — resolves when the file has been formatted and written.

```ts
await formatFile('./src/generated.ts');
await formatFile('./config.json', { formatter: 'prettier' });
```

#### FileFormatterOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `formatter` | `'biome' \| 'prettier' \| 'inherit'` | `'inherit'` | Formatter to use. `'inherit'` tries each available formatter in order. |

---

### `formatFiles(filePaths, options?)`

Formats a set of files in-place. Equivalent to calling `formatFile` on each path.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePaths` | `string[]` | — | Required. List of file paths. Relative paths resolve from `process.cwd()`. |
| `options` | `FileFormatterOptions` | `{}` | Optional. Same options as [`formatFile`](#formatfilefilepath-options). |

**Returns** `Promise<void>` — resolves when all files have been formatted and written.

```ts
await formatFiles(['./src/generated.ts', './src/other.ts']);
```

---

### `formatText(content, options?)`

Formats a raw text string as if it were a file, returning the formatted result.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `content` | `string` | — | Required. The raw text content to format. |
| `options` | `TextFormatterOptions` | `{}` | Optional. See [TextFormatterOptions](#textformatteroptions). |

**Returns** `Promise<string>` — the formatted text content.

```ts
const formatted = await formatText('export    const  foo={abc:1}', { ext: '.ts' });
```

#### TextFormatterOptions

Extends [FileFormatterOptions](#fileformatteroptions) with:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `formatter` | `'biome' \| 'prettier' \| 'inherit'` | `'inherit'` | Formatter to use. |
| `ext` | `'.json' \| '.js' \| '.ts' \| '.mjs' \| '.mts' \| '.cjs' \| '.cts' \| '.jsx' \| '.tsx'` | `'.js'` | File extension used to select formatting rules. |

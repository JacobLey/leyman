<div style="text-align:center">

# format-file

Format files and text with Biome or Prettier, whichever the project uses.

[![npm package](https://badge.fury.io/js/format-file.svg)](https://www.npmjs.com/package/format-file)
[![License](https://img.shields.io/npm/l/format-file.svg)](https://github.com/JacobLey/leyman/blob/main/tools/format-file/LICENSE)

</div>

Generated code and config files are often checked into version control, so they should follow the repository's formatting rules like the rest of the code. `format-file` formats them with the project's own [Biome](https://biomejs.dev/) or [Prettier](https://prettier.io/) setup, whichever is installed and configured. It can format files in place, or format a string of text and return the result.

Formatting is best-effort. If no formatter is installed, or the formatter fails on the input, the content is left as it was (see [Usage](#usage)).

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

Formatting is best-effort and never throws because of the formatter. If neither biome nor prettier is installed, files and text are left unchanged. So is anything a formatter fails on (such as a syntax error), a file that does not exist, and a file the formatter's own ignore settings exclude. Nothing is reported, so check the result if it matters. Since the output may not be formatted at all, it is best to generate reasonable output to begin with (for example `JSON.stringify(data, null, 2)`).

Every file passed is formatted, even when `.gitignore` lists it, since generated files are often ignored. Biome runs with its VCS integration off and Prettier reads only `.prettierignore`, so each formatter's own ignore settings (Biome's `files.includes`, `.prettierignore`) still apply. Prettier also skips files in `node_modules` and version control directories (`.git`...), as its CLI does.

Without `formatter` (`'inherit'`), every installed formatter is tried: one with a config file found (`biome.json`/`biome.jsonc` above the working directory, or a Prettier config) first, then `biome` before `prettier`. The first one that succeeds is used, and the others are not run. Only Prettier formats Markdown (`.md`, `.markdown`), because Biome formats YAML frontmatter as a heading unless a project opts in with `markdown.parser.frontmatter`. Without Prettier, Markdown is left unchanged. Biome runs as a child process. Prettier runs in the calling process: it is imported on first use, so a project that only uses Biome never loads it, and each call reads its configuration (and `.editorconfig`) as it is at the time. Which formatters are installed and configured is determined once per process. Both are resolved as peer dependencies of `format-file`, so install them where `format-file` is installed.

## API

### `formatFile(filePath, options?)`

Formats a file in-place according to the project's formatter configuration.

**Parameters**

| Parameter  | Type                   | Default | Description                                                              |
| ---------- | ---------------------- | ------- | ------------------------------------------------------------------------ |
| `filePath` | `string`               | —       | Required. Path to the file. Relative paths resolve from `process.cwd()`. |
| `options`  | `FileFormatterOptions` | `{}`    | Optional. See [FileFormatterOptions](#fileformatteroptions).             |

**Returns** `Promise<void>` — resolves when the file has been formatted and written.

```ts
await formatFile('./src/generated.ts');
await formatFile('./config.json', { formatter: 'prettier' });
```

#### FileFormatterOptions

Exported as a type: `import type { FileFormatterOptions } from 'format-file'`.

| Option      | Type                                 | Default     | Description                                                            |
| ----------- | ------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| `formatter` | `'biome' \| 'prettier' \| 'inherit'` | `'inherit'` | Formatter to use. `'inherit'` tries each available formatter in order. |

---

### `formatFiles(filePaths, options?)`

Formats a set of files in-place. Equivalent to calling `formatFile` on each path.

**Parameters**

| Parameter   | Type                   | Default | Description                                                                                            |
| ----------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `filePaths` | `readonly string[]`    | —       | Required. List of file paths. Relative paths resolve from `process.cwd()`. An empty list does nothing. |
| `options`   | `FileFormatterOptions` | `{}`    | Optional. Same options as [`formatFile`](#formatfilefilepath-options).                                 |

**Returns** `Promise<void>` — resolves when all files have been formatted and written.

```ts
await formatFiles(['./src/generated.ts', './src/other.ts']);
```

---

### `formatText(content, options?)`

Formats a raw text string as if it were a file in the current working directory, so the project's formatter configuration applies, and returns the formatted result. If no formatter succeeds, the text is returned unchanged.

**Parameters**

| Parameter | Type                   | Default | Description                                                  |
| --------- | ---------------------- | ------- | ------------------------------------------------------------ |
| `content` | `string`               | —       | Required. The raw text content to format.                    |
| `options` | `TextFormatterOptions` | `{}`    | Optional. See [TextFormatterOptions](#textformatteroptions). |

**Returns** `Promise<string>` — the formatted text content.

```ts
const formatted = await formatText('export    const  foo={abc:1}', { ext: '.ts' });
```

#### TextFormatterOptions

Extends [FileFormatterOptions](#fileformatteroptions) with:

| Option      | Type                                                                                                                                   | Default     | Description                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------- |
| `formatter` | `'biome' \| 'prettier' \| 'inherit'`                                                                                                   | `'inherit'` | Formatter to use.                               |
| `ext`       | `'.json'` or `` `.${'' \| 'c' \| 'm'}${'js' \| 'ts'}${'' \| 'x'}` `` (`.js`, `.ts`, `.mjs`, `.mts`, `.cjs`, `.cts`, `.jsx`, `.tsx`, …) | `'.js'`     | File extension used to select formatting rules. |

<div style="text-align:center">

# parse-cwd
Convert a relative path or URL to an absolute directory path.

[![npm package](https://badge.fury.io/js/parse-cwd.svg)](https://www.npmjs.com/package/parse-cwd)
[![License](https://img.shields.io/npm/l/parse-cwd.svg)](https://github.com/JacobLey/leyman/blob/main/tools/parse-cwd/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [parseCwd](#parsecwdcwd)

## Install

```sh
npm i parse-cwd
```

## Example

```ts
import { parseCwd } from 'parse-cwd';

// process.cwd() = /path/to/cwd

await parseCwd();                              // /path/to/cwd
await parseCwd(process.cwd());                 // /path/to/cwd
await parseCwd('foo/bar/my-file.js');          // /path/to/cwd/foo/bar
await parseCwd(import.meta.url);               // /path/to/cwd/foo/bar
await parseCwd(new URL(import.meta.url));      // /path/to/cwd/foo/bar
await parseCwd({ cwd: 'foo/bar/my-file.js' }); // /path/to/cwd/foo/bar

// Throws if the resolved directory does not exist
await parseCwd('does/not/exist'); // Error: Directory not found
```

## Usage

`parse-cwd` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { parseCwd } = await import('parse-cwd');`.

## API

### `parseCwd(cwd?)`

Resolves a path or URL to an absolute directory path and validates that the directory exists. When given a file path, returns the file's parent directory. Accepts an options object with a `cwd` key for convenient pass-through of higher-level options objects.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cwd` | `string \| URL \| { cwd?: string \| URL } \| null \| undefined` | `undefined` | Optional. Path, URL, or options object to resolve. Relative paths are resolved from `process.cwd()`. When omitted or `null`, returns `process.cwd()` unchanged. |

**Returns** `Promise<string>` — the absolute path to the resolved directory.

**Throws** `Error` — if the resolved directory does not exist on the filesystem.

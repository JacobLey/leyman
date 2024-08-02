<div style="text-align:center">

# format-file
Format files based on existing formatter configs like Biome.

[![npm package](https://badge.fury.io/js/format-file.svg)](https://www.npmjs.com/package/format-file)
[![License](https://img.shields.io/npm/l/format-file.svg)](https://github.com/JacobLey/leyman/blob/main/tools/format-file/LICENSE)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Installation](#installation)
* [Example](#example)
* [API](#api)
  * [formatFile](#formatfilefilepath-options)
  * [formatFiles](#formatfilesfilepath-options)
  * [formatText](#formattextcontent-options)

## Introduction

Code and config generation is hard enough already. Some of this code should be checked into version control, and should therefore abide by the repositories code formatting rules.

`format-file` is a package which will return a formatted version of generated JSON, typescript, and javascript files by inferring the formatting rules at runtime.

Under the hood, it uses either the user's configured [biome](https://biomejs.dev/) or [prettier](https://prettier.io/) setup to format files on their behalf.

## Installation

`npm i format-file`

Format-file is an ESM package. It _must_ be imported.

Due to [peer dependencies](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#peerdependenciesmeta) on biome + prettier, it is recommended to install at least one of them as well (or set up a similar peer dependency).

## Example

```ts
// generated.ts
export    const  foo={
abc   : 123,
      efg:456  ,
} ;

// index.ts
import { formatFile, formatText } from 'format-file';

await formatFile('./generated.ts');
readFileSync('/generated.ts', 'utf8');
/**
 * export const foo = {
 *   abc: 123,
 *   efg: 456
 * };
 */

await formatText(`
{     "abc":123   ,
     "efg":
              456}
`, { ext: '.json' });
/**
 * {
 *   "abc": 123,
 *   "efg": 456
 * }
 */
```

## Usage

File formatting is best effort and is not necessarily guaranteed to succeed. Primarily if the repo does not have biome or prettier installed.

It is recommended to create _reasonable_ files before formatting, such as generating JSON files using `JSON.stringify(content, null, 2)` as a reasonable default.

Both biome and prettier have been declared as optional [peerDependencies](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#peerdependenciesmeta) in this package. If using this library as an internal functionality, it is recommended to keep biome and prettier as optional peer dependencies to maintain your package's dependency.

## API

### `formatFile(filePath, options?)`

Formats a file in-place.

The first parameter is the file path. If the path is relative, will be resolved from working directory just like regular `fs` methods.

The second parameter is an optional object with a `formatter` property.
While the default behavior is `'inherit'` which will iterate over viable formatters based on support. It may be overridden with `'biome'` or `'parser'`.

Returns a promise which when resolved, means the file is formatted according user settings.

### `formatFiles(filePath[], options?)`

Formats a set of files in-place.

First parameter is a list of file paths. Any paths that are relative will be resolved from working directory just like regular `fs` methods.

Second parameter is an optional object the same as [formatFile](#formatfilefilepath-options)

Returns a promise which when resolved, means the files are formatted according user settings.

### `formatText(content, options?)`

Formats an inline text body as if it were a file.

Parameter is the raw text body.

Second parameter is options which include a `ext`, which defaults to `.js`. It also support sthe `formatter` option that [formatFile](#formatfilefilepath-options) has.

Returns a promise which resolves to a formatted version of the text.

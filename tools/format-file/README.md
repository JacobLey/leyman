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
  * [formatFile](#formatfilefilepath)
  * [formatFiles](#formatfilesfilepaths)
  * [formatText](#formattextcontent-options)

## Introduction

Code and config generation is hard enough already. Some of this code should be checked into version control, and should therefore abide by the repositories code formatting rules.

`format-file` is a package which will return a formatted version of generated JSON, typescript, and javascript files by inferring the formatting rules at runtime.

## Installation

`npm i format-file`

Format-file is an ESM package. It _must_ be imported.

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

## API

### `formatFile(filePath)`

Formats a file in-place.

Parameter is the file path. If the path is relative, will be resolved from working directory just like regular `fs` methods.

Returns a promise which when resolved, means the file is formatted according user settings.

### `formatFiles(filePath[])`

Formats a set of files in-place.

Parameter is a list of file paths. Any paths that are relative will be resolved from working directory just like regular `fs` methods.

Returns a promise which when resolved, means the files are formatted according user settings.

### `formatText(content, options)`

Formats an inline text body as if it were a file.

Parameter is the raw text body. Second parameter is options which include a `ext`, which defaults to `.js`.

Returns a promise which resolves to a formatted version of the text.

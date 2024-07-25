<div style="text-align:center">

# >parse-cwd
Parse full current working directory from relative path or URL.

[![npm package](https://badge.fury.io/js/parse-cwd.svg)](https://www.npmjs.com/package/parse-cwd)
[![License](https://img.shields.io/npm/l/parse-cwd.svg)](https://github.com/JacobLey/leyman/blob/main/tools/parse-cwd/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [parseCwd](#parsecwdcwd)

## Introduction

Parses the full path to current working directory.

Validates that directory actually exists.

## Install

```sh
npm i parse-cwd
```

## Example

```ts
import { parseCwd } from 'parse-cwd';

console.log(process.cwd()); // /path/to/cwd
console.log(import.meta.url); // file:///path/to/cwd/foo/bar/my-file.js

console.log(await parseCwd()); // /path/to/cwd
console.log(await parseCwd(process.cwd())); // /path/to/cwd
console.log(await parseCwd('foo/bar/my-file.js')); // /path/to/cwd/foo/bar
console.log(await parseCwd('./foo/bar/my-file.js')); // /path/to/cwd/foo/bar
console.log(await parseCwd(import.meta.url)); // /path/to/cwd/foo/bar
console.log(await parseCwd(new URL(import.meta.url))); // /path/to/cwd/foo/bar
console.log(await parseCwd({ cwd: 'foo/bar/my-file.js' })); // /path/to/cwd/foo/bar

// Error - Directory not found
await parseCwd('does/not/exist');
```

## Usage

`parse-cwd` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { parseCwd } = await import('parse-cwd');`.

## API

### parseCwd(cwd)

* cwd
  * file path to resolve to URL
  * Type: `string` or `URL` or `null`
  * optional, defaults to `process.cwd()`
  * Optionally wrap as an object, e.g. `{ cwd: '/foo/bar' }`
    * Convenient for directly passing higher level `options` object

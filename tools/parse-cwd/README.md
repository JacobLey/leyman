<div style="text-align:center">

<h1>parse-cwd</h1>
<p>Parse full current working directory from relative path or URL.</p>

[![npm package](https://badge.fury.io/js/parse-cwd.svg)](https://www.npmjs.com/package/parse-cwd)
[![License](https://img.shields.io/npm/l/parse-cwd.svg)](https://github.com/JacobLey/leyman/blob/main/common/config/publish/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/parse-cwd.svg)](https://github.com/JacobLey/leyman/blob/main/tools/parse-cwd)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

<a name="Introduction"></a>
## Introduction

Parses the full path to current working directory.

Validates that directory actually exists.

<a name="Install"></a>
## Install

```sh
npm i parse-cwd
```

<a name="Example"></a>
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

<a name="Usage"></a>
## Usage

`parse-cwd` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { parseCwd } = await import('parse-cwd');`.

<a name="Api"></a>
## API

### parseCwd(cwd)

* cwd
  * file path to resolve to URL
  * Type: `string` or `URL` or `null`
  * optional, defaults to `process.cwd()`
  * Optionally wrap as an object, e.g. `{ cwd: '/foo/bar' }`
    * Convenient for directly passing higher level `options` object

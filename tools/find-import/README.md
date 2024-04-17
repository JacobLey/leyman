<div style="text-align:center">

<h1>find-import</h1>
<p>Find and load first instance of js/json in parent directories.</p>

[![npm package](https://badge.fury.io/js/find-import.svg)](https://www.npmjs.com/package/find-import)
[![License](https://img.shields.io/npm/l/find-import.svg)](https://github.com/JacobLey/leyman/blob/main/tools/find-import/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/find-import.svg)](https://github.com/JacobLey/leyman/blob/main/tools/find-import)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

<a name="Introduction"></a>
## Introduction

Load the first instance of a found module.

Optionally specify depth preference to prefer "top-most" packages.

Supports `.json`, `.cjs`, `.mjs`, and `.js`.

Returns the path and contents of the found module.

<a name="Install"></a>
## Install

```sh
npm i find-import
```

<a name="Example"></a>
## Example

Given file structure
```
/
└─┬ root
  ├── my-file.cjs // module.exports = { abc: 123 }
  └─┬ my-package
    └── my-file.json // { "foo": "bar" }
```

```ts
// cwd = /root/my-package
import { findImport } from 'find-import';

let found;

found = await findImport(['my-file.cjs', 'my-file.json']);
found.content // { foo: 'bar' }
found.filePath // /root/my-package/my-file.json

found = await findImport(['my-file.cjs', 'my-file.json'], {
    direction: 'down',
});
found.content // { abc: 123 }
found.filePath // /root/my-file.cjs

found = await findImport(['my-file.cjs', 'my-file.json'], {
    direction: 'down',
    startAt: '/root/my-package',
});
found.filePath // /root/my-package/my-file.json


found = await findImport(['my-file.cjs', 'my-file.json'], {
    cwd: '/root',
});
found.filePath // /root/my-package/my-file.cjs
```

<a name="Usage"></a>
## Usage

`find-import` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { findImport } = await import('find-import');`.

<a name="Api"></a>
## API

### findImport(fileNames, options?)

Finds first instance of matching module, and loads. Returns file path to module and content.

Note that `content` is the result of a dynamic `import()` call. If accessing the default content, it may be necessary/convenient to extract that content. See [default-import](https://www.npmjs.com/package/default-import) for a potential solution.

### fileNames

string or array of strings

List of file names to search for in each directory.

#### options

* cwd
  * Type: `string` or `URL`
  * optional, defaults to `process.cwd()`
  * Directory to use as base directory.
  * See [`parse-cwd`](https://www.npmjs.com/package/parse-cwd).

* direction
  * `'up'`(default) or `'down'`
  * direction to search for files.
    * `'up'` indicates `/foo/bar` -> `/foo` -> `/`
    * `'down'` is opposite, `/` -> `/foo` -> `/foo/bar`

* startAt
  * Type: `string` or `URL`
  * optional, defaults to `/`
  * Top-most "root" directory to limit search.

<div style="text-align:center">

# default-import
Properly handle CJS default imports in ESM.

[![npm package](https://badge.fury.io/js/default-import.svg)](https://www.npmjs.com/package/default-import)
[![License](https://img.shields.io/npm/l/default-import.svg)](https://github.com/JacobLey/leyman/blob/main/tools/default-import/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [defaultImport](#defaultimport)

## Introduction

Handle importing unknown/CJS modules in ESM that do not properly export a default value.

Importing CJS is supported natively in ESM, and the "default" import is the raw `module.exports` value. See [NodeJS docs](https://nodejs.org/docs/latest/api/esm.html#interoperability-with-commonjs).

Some libraries improperly mix "default" and "named" exports in CommonJS, which requires extra instrumenting that is not natively available in ESM.

This library intends to provide the most basic instrumentation to properly access the default import.

## Install

```sh
npm i default-import
```

## Example

```ts
// a.cts
export default 123;

export const named = 456;
```
Compiles to
```ts
// a.cjs
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.named = void 0;
exports.default = 123;
exports.named = 456;
```

So importing doesn't work as expected!
```ts
// b.ts
import a from './a.cjs';
import { defaultImport } from 'default-import';

console.log(a);
// Expected: 123
// Actual: { __esModule: true, default: 123, named: 456 }

const dynamicA = await import('./a.cjs');
console.log(dynamicA.default);
// Expected: 123
// Actual: { __esModule: true, default: 123, named: 456 }

console.log(defaultImport(a)) // 123
console.log(defaultImport(dynamicA)) // 123
console.log(defaultImport(dynamicA.default)) // 123
```

## Usage

`default-import` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { defaultImport } = await import('default-import');`.

`defaultImport()` is idempotent and handles properly exported defaults so it is safe to use in environments that correctly provide default imports. That said, it is generally overkill and unnecessary to use this library in those cases.

It is best used when the runtime/source is not entirely in control, such as NextJS (ESM on server, "commonjs" on browser).

## API

### defaultImport(*)

Extracts the _proper_ default import from a CJS import.

Idempotent, and correctly handles proper default exports (e.g. default import from ESM .mjs file).

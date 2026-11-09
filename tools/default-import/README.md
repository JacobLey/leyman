<div style="text-align:center">

# default-import

Properly handle CJS default imports in ESM.

[![npm package](https://badge.fury.io/js/default-import.svg)](https://www.npmjs.com/package/default-import)
[![License](https://img.shields.io/npm/l/default-import.svg)](https://github.com/JacobLey/leyman/blob/main/tools/default-import/LICENSE)

</div>

Node.js can import CommonJS from ESM, and the default import is the whole `module.exports` object (see the [Node.js docs](https://nodejs.org/docs/latest/api/esm.html#interoperability-with-commonjs)). Some libraries mix "default" and "named" exports in CommonJS, with an `__esModule` flag and the real default under `exports.default`, so importing them from ESM gives you `{ __esModule: true, default: ... }` instead of the value you wanted.

`defaultImport(value)` takes the imported value and returns the real default export from under `.default`. A value that is already a proper default is returned as it is. It's meant for code where you don't fully control how a dependency is loaded, since in projects that get correct default imports it isn't needed.

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [defaultImport](#defaultimportvalue)

## Install

```sh
npm i default-import
```

## Example

```ts
import a from './a.cjs';
import { defaultImport } from 'default-import';

// Without defaultImport:
console.log(a);
// { __esModule: true, default: 123, named: 456 }  ← not what you wanted

// With defaultImport:
console.log(defaultImport(a));          // 123
console.log(defaultImport(await import('./a.cjs'))); // 123
```

## Usage

`default-import` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { defaultImport } = await import('default-import');`.

`defaultImport()` is idempotent, so it is safe to call on values that are already correctly typed default exports.

At runtime it unwraps a module namespace (an object tagged `Symbol.toStringTag` `'Module'`) to its `default`, and then an object with `__esModule: true` and a defined `default` to that `default`. Anything else, including a plain object that merely has a `default` key, is returned as is. The return type unwraps any object with a `default` property, up to two levels, so for a plain `{ default: x }` the type is `typeof x` while the value is still the object.

## API

### `defaultImport(value)`

Extracts the correct default export from a CJS or ESM import. Handles the `__esModule` interop flag and the `Module` symbol tag set by bundlers such as webpack.

**Parameters**

| Parameter | Type      | Default | Description                                                                                           |
| --------- | --------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `value`   | `unknown` | —       | Required. The imported value to unwrap. Accepts a static import, dynamic import result, or any value. |

**Returns** `ExtractDefault<T>` — the unwrapped default value. TypeScript narrows the return type to match the actual default type of the input.

<div style="text-align:center">

# default-import
Properly handle CJS default imports in ESM.

[![npm package](https://badge.fury.io/js/default-import.svg)](https://www.npmjs.com/package/default-import)
[![License](https://img.shields.io/npm/l/default-import.svg)](https://github.com/JacobLey/leyman/blob/main/tools/default-import/LICENSE)

</div>

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

`defaultImport()` is idempotent — it is safe to call on values that are already correctly typed default exports.

## API

### `defaultImport(value)`

Extracts the correct default export from a CJS or ESM import. Handles the `__esModule` interop flag and the `Module` symbol tag set by bundlers such as webpack.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `unknown` | — | Required. The imported value to unwrap. Accepts a static import, dynamic import result, or any value. |

**Returns** `ExtractDefault<T>` — the unwrapped default value. TypeScript narrows the return type to match the actual default type of the input.

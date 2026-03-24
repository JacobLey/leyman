<div style="text-align:center">

<h1>enum-to-array</h1>
<p>Convert TypeScript enums to a strongly typed array.</p>

[![npm package](https://badge.fury.io/js/enum-to-array.svg)](https://www.npmjs.com/package/enum-to-array)
[![License](https://img.shields.io/npm/l/enum-to-array.svg)](https://github.com/JacobLey/leyman/blob/main/tools/enum-to-array/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [enumToArray](#enumtoarrayenumedict)
  - [enumToValues](#enumtovaluesenumdict-options)
  - [enumToKeys](#enumtokeysenumdict)

## Install

```sh
npm i enum-to-array
```

## Example

```ts
import { enumToArray } from 'enum-to-array';

enum MyEnum {
    FOO = 'BAR',
    ABC = 123,
    DUP = FOO,
}

console.log(enumToArray(MyEnum));
// [
//   { key: 'FOO', value: 'BAR' },
//   { key: 'ABC', value: 123 },
//   { key: 'DUP', value: 'BAR' },
// ]
```

## Usage

`enum-to-array` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { enumToArray } = await import('enum-to-array');`.

`const enum` is not supported because there is no runtime object to pass. This can be partially resolved by enabling [preserveConstEnums](https://www.typescriptlang.org/tsconfig#preserveConstEnums) in TypeScript config.

TypeScript's [reverse mappings](https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings) for numeric enums add extra entries to the enum object (e.g. `{ FOO: 0, 0: 'FOO' }`). All three functions filter these out automatically, returning only the forward key→value pairs.

## API

### `enumToArray(enumDict)`

Returns key-value pairs for all enum members in declaration order.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enumDict` | `Record<string, unknown>` | — | Required. The enum object to convert. |

**Returns** `{ key: string; value: EnumValue }[]` — array of `{ key, value }` pairs, strongly typed to the enum's key and value union types. Numeric reverse-mapping entries are excluded.

```ts
console.log(enumToArray(MyEnum));
// [{ key: 'FOO', value: 'BAR' }, { key: 'ABC', value: 123 }, { key: 'DUP', value: 'BAR' }]
```

---

### `enumToValues(enumDict, options?)`

Returns only the values of the enum in declaration order. TypeScript narrows the return type to the enum's value union type.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enumDict` | `Record<string, unknown>` | — | Required. The enum object to convert. |
| `options` | `object` | `{}` | Optional. |
| `options.unique` | `boolean` | `false` | When `true`, duplicate values are removed; the first occurrence is kept. |

**Returns** `EnumValue[]` — array of enum values, typed to the enum's value union type.

```ts
console.log(enumToValues(MyEnum));
// ['BAR', 123, 'BAR']

console.log(enumToValues(MyEnum, { unique: true }));
// ['BAR', 123]
```

---

### `enumToKeys(enumDict)`

Returns only the keys of the enum in declaration order.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enumDict` | `Record<string, unknown>` | — | Required. The enum object to convert. |

**Returns** `(keyof Enum)[]` — array of enum key strings, typed to the enum's key union type.

```ts
console.log(enumToKeys(MyEnum));
// ['FOO', 'ABC', 'DUP']
```

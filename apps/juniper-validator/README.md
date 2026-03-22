<div style="text-align:center">

# Juniper Validator
Standard Schema compliant validator for [Juniper](https://www.npmjs.com/package/juniper)

[![npm package](https://badge.fury.io/js/juniper-validator.svg)](https://www.npmjs.com/package/juniper-validator)
[![License](https://img.shields.io/npm/l/juniper-validator.svg)](https://github.com/JacobLey/leyman/blob/main/apps/juniper-validator/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [API](#api)

## Introduction

`juniper-validator` wraps a [Juniper](https://www.npmjs.com/package/juniper) schema (or compiled JSON Schema) with a [StandardSchema](https://standardschema.dev/)-compliant interface. It uses [Ajv](https://ajv.js.org/) internally to compile and run validation.

## Install

```sh
npm i juniper juniper-validator
```

## Example

```ts
import { mergeSchema, numberSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const schema = mergeSchema().anyOf([
    numberSchema().exclusiveMinimum(2).maximum(13),
    stringSchema().contains('foo').endsWith('bar'),
]);

const validator = makeValidator(schema);

// Type guard
if (validator.is(value)) {
    // value is typed as `number | string` here
}

// Assertion — throws if invalid
validator.assert(value);
// value is typed as `number | string` here

// Validate — returns result object
const result = validator.validate(value);
if (result.issues) {
    console.error(result.issues.map(i => i.message));
    // e.g. ['must be number', 'must be string', 'must match a schema in anyOf']
} else {
    console.log(result.value);
}
```

## API

### `makeValidator(schema, options?)`

Creates a `JuniperValidator` from a Juniper `Schema` instance or a compiled `JsonSchema` object.

```ts
import { makeValidator } from 'juniper-validator';

const validator = makeValidator(schema);
```

**Parameters**

- `schema` — a Juniper `Schema` instance or `JsonSchema` object.
- `options` _(optional)_ — [Ajv constructor options](https://ajv.js.org/options.html), excluding `strict` (always set to `true`).

**Returns** a `JuniperValidator<T>`.

---

### `JuniperValidator<T>`

The object returned by `makeValidator`. Implements the [StandardSchema v1](https://standardschema.dev/) interface and adds the following methods:

#### `is(value): value is T`

Type guard. Returns `true` if `value` matches the schema.

```ts
if (validator.is(value)) {
    // value is T
}
```

#### `assert(value): asserts value is T`

Assertion. Throws an `Error` with message `'Value does not match schema'` and the Ajv error objects as `cause` if validation fails.

```ts
validator.assert(value);
// value is T
```

#### `validate(value): StandardSchemaV1.Result<T>`

Convenience shorthand for the StandardSchema `~standard.validate` method. Returns `{ value }` on success, or `{ issues }` on failure where each issue has a `message` string.

```ts
const result = validator.validate(value);
if ('issues' in result) {
    // result.issues: StandardSchemaV1.Issue[]
}
```

---

### Utility Types

`ValidatorType<V>` and `AssertionType<V>` extract the inferred type and assertion function signature from a `JuniperValidator` instance. Useful as TypeScript helpers when passing validators around.

```ts
import type { AssertionType, ValidatorType } from 'juniper-validator';

type MyType = ValidatorType<typeof validator>;
// equivalent to SchemaType<typeof schema>

const assert: AssertionType<typeof validator> = validator.assert;
```

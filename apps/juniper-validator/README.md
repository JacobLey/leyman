<div style="text-align:center">

# Juniper Validator
StandardSchema-compliant validator for [Juniper](https://www.npmjs.com/package/juniper) schemas.

[![npm package](https://badge.fury.io/js/juniper-validator.svg)](https://www.npmjs.com/package/juniper-validator)
[![License](https://img.shields.io/npm/l/juniper-validator.svg)](https://github.com/JacobLey/leyman/blob/main/apps/juniper-validator/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [makeValidator](#makevalidatorschema-options)
  - [JuniperValidator](#junipervalidatort)
  - [Utility Types](#utility-types)
- [Also See](#also-see)

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

## Usage

`juniper-validator` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { makeValidator } = await import('juniper-validator');`.

Pass a Juniper `Schema` instance (or a plain `JsonSchema` object) to `makeValidator`. The returned validator implements the [StandardSchema v1](https://standardschema.dev/) interface, making it compatible with any library that accepts standard validators (e.g. form libraries, OpenAPI tooling).

Ajv is used internally to compile and run validation. The `strict` option is always `true`.

## API

### `makeValidator(schema, options?)`

Creates a `JuniperValidator` from a Juniper `Schema` instance or a compiled `JsonSchema` object.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schema` | `Schema \| JsonSchema` | — | Required. A Juniper `Schema` instance or plain JSON Schema object. |
| `options` | `AjvOptions` | `{}` | Optional. [Ajv constructor options](https://ajv.js.org/options.html). The `strict` option is always forced to `true`. |

**Returns** `JuniperValidator<T>` — a validator instance typed to the schema's inferred type.

---

### `JuniperValidator<T>`

Implements the [StandardSchema v1](https://standardschema.dev/) interface. Returned by `makeValidator`.

#### `.is(value): value is T`

Type guard. Returns `true` if `value` matches the schema, narrowing the type to `T`.

```ts
if (validator.is(value)) {
    // value is T
}
```

#### `.assert(value): asserts value is T`

Throws an `Error` with message `'Value does not match schema'` and Ajv error objects as `cause` if validation fails. Narrows the type to `T` after the call.

```ts
validator.assert(value);
// value is T
```

#### `.validate(value): StandardSchemaV1.Result<T>`

Convenience shorthand for the StandardSchema `~standard.validate` method. Returns `{ value: T }` on success, or `{ issues: StandardSchemaV1.Issue[] }` on failure. Each issue has a `message` string.

```ts
const result = validator.validate(value);
if ('issues' in result) {
    console.error(result.issues.map(i => i.message));
}
```

---

### Utility Types

#### `ValidatorType<V>`

Extracts the inferred data type `T` from a `JuniperValidator<T>` instance type.

```ts
import type { ValidatorType } from 'juniper-validator';

type MyType = ValidatorType<typeof validator>;
// Equivalent to SchemaType<typeof schema>
```

#### `AssertionType<V>`

Extracts the assertion function signature from a `JuniperValidator<T>` instance type. Useful for typing parameters that accept an assertion function.

```ts
import type { AssertionType } from 'juniper-validator';

const assert: AssertionType<typeof validator> = validator.assert;
```

## Also See

- [`juniper`](https://www.npmjs.com/package/juniper) — JSON Schema builder with static TypeScript inference; used to create the schemas passed to `makeValidator`
- [StandardSchema](https://standardschema.dev/) — the interface `JuniperValidator` implements
- [Ajv](https://ajv.js.org/) — the underlying JSON Schema validator

<div style="text-align:center">

# Juniper Validator
StandardSchema-compliant validator for [Juniper](https://www.npmjs.com/package/juniper) schemas.

[![npm package](https://badge.fury.io/js/juniper-validator.svg)](https://www.npmjs.com/package/juniper-validator)
[![License](https://img.shields.io/npm/l/juniper-validator.svg)](https://github.com/JacobLey/leyman/blob/main/apps/juniper-validator/LICENSE)

</div>

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/juniper-validator/).

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

`juniper` is a required peer dependency (`^2.4.4`). Requires Node 24 or later. `ajv` and `ajv-formats` are installed with this package.

## Example

```ts
import { mergeSchema, numberSchema, stringSchema, type SchemaType } from 'juniper';
import { makeValidator, type JuniperValidator } from 'juniper-validator';

const schema = mergeSchema().anyOf([
    numberSchema().exclusiveMinimum(2).maximum(13),
    stringSchema().contains('foo').endsWith('bar'),
]);

// `assert` only narrows when the validator's type is written out (see `.assert` below)
const validator: JuniperValidator<SchemaType<typeof schema>> = makeValidator(schema);

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

Ajv is used internally to compile and run validation. The `strict` option is always `true`; keywords added with Juniper's `.metadata()` are registered as annotations, so they pass it. Ajv's `strictTuples` check is off by default, since it rejects Juniper's open tuples (`arraySchema().prefixItem(...)`); pass `strictTuples: true` to turn it on. Ajv's `discriminator` option is on by default, for Juniper's discriminated `oneOf`.

Ajv stops at the first failure within a schema, so `validate` reports one issue for an object missing two properties unless you pass `allErrors: true`.

The validator also implements [Standard JSON Schema](https://standardschema.dev/), the same as the Juniper schema it was made from. A validator made from a plain `JsonSchema` object only supports the `'draft-2020-12'` target, and throws for the others.

## API

### `makeValidator(schema, options?)`

Creates a `JuniperValidator` from a Juniper `Schema` instance or a compiled `JsonSchema` object.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schema` | `Schema \| JsonSchema` | — | Required. A Juniper `Schema` instance or plain JSON Schema object. |
| `options` | `AjvOptions` | `{}` | Optional. [Ajv constructor options](https://ajv.js.org/options.html). The `strict` option is always forced to `true`, and `jsPropertySyntax` is not supported. Standard `format`s (`email`, `uuid`, `date-time`, ...) are validated with [ajv-formats](https://www.npmjs.com/package/ajv-formats). |

**Returns** `JuniperValidator<T>` — a validator instance typed to the schema's inferred type.

---

### `JuniperValidator<T>`

Exported as a type. Implements the [StandardSchema v1](https://standardschema.dev/) and Standard JSON Schema v1 interfaces. Returned by `makeValidator`.

#### `.is(value): value is T`

Type guard. Returns `true` if `value` matches the schema, narrowing the type to `T`.

```ts
if (validator.is(value)) {
    // value is T
}
```

#### `.assert(value): asserts value is T`

Throws an `Error` with message `'Value does not match schema'` and Ajv error objects as `cause` if validation fails. Narrows the type to `T` after the call.

TypeScript only narrows with an assertion function whose type is written out. Calling `assert` on `const validator = makeValidator(schema)`, or on a destructured `const { assert } = validator`, fails with `TS2775: Assertions require every name in the call target to be declared with an explicit type annotation`. Annotate the validator with `JuniperValidator<T>`, or the function with `AssertionType`:

```ts
const validator: JuniperValidator<string> = makeValidator(stringSchema());
validator.assert(value);
// value is string

const assertString: AssertionType<typeof validator> = validator.assert;
assertString(other);
```

`is` and `validate` have no such restriction.

#### `.validate(value): StandardSchemaV1.Result<T>`

Convenience shorthand for the StandardSchema `~standard.validate` method. Returns `{ value: T }` on success, or `{ issues: StandardSchemaV1.Issue[] }` on failure. Each issue is an [Ajv error object](https://ajv.js.org/api.html#error-objects) with a `message` string and a `path` to the invalid value (array indices as numbers, and missing or extra properties at that property).

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

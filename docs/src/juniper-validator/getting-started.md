---
description: Install juniper-validator, build a validator, and check data with it.
---

# Getting started

## Install

`juniper` is a peer dependency, so install both:

::: code-group

```sh [npm]
npm i juniper juniper-validator
```

```sh [pnpm]
pnpm add juniper juniper-validator
```

```sh [yarn]
yarn add juniper juniper-validator
```

:::

::: tip
juniper-validator is ESM only, and requires Node.js 24 or later. From CommonJS, load it with a
dynamic import: `const { makeValidator } = await import('juniper-validator');`
:::

## Make a validator

Pass a schema to `makeValidator`. The schema is compiled once, so make the validator once and reuse it:

```ts
import { mergeSchema, numberSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const schema = mergeSchema().anyOf([
    numberSchema().exclusiveMinimum(2).maximum(13),
    stringSchema().contains('foo').endsWith('bar'),
]);

const validator = makeValidator(schema);
//    ^?
```

A validator checks data three ways.

### `is()`: type guard

Returns whether the value matches, and narrows it when it does:

```ts
import { mergeSchema, numberSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const validator = makeValidator(
    mergeSchema().anyOf([
        numberSchema().exclusiveMinimum(2).maximum(13),
        stringSchema().contains('foo').endsWith('bar'),
    ])
);
declare const input: unknown;
// ---cut---
if (validator.is(input)) {
    console.log(input);
    //          ^?
}
```

### `validate()`: issues

Returns the value, or the reasons it doesn't match:

```ts
import { mergeSchema, numberSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const validator = makeValidator(
    mergeSchema().anyOf([
        numberSchema().exclusiveMinimum(2).maximum(13),
        stringSchema().contains('foo').endsWith('bar'),
    ])
);
// ---cut---
const result = validator.validate(true);

if (result.issues) {
    console.error(result.issues.map(issue => issue.message));
    // ['must be number', 'must be string', 'must match a schema in anyOf']
} else {
    console.log(result.value);
    //                 ^?
}
```

### `assert()`: throw

Throws when the value doesn't match, and narrows it after the call when it does. TypeScript only narrows with an assertion function whose type is written out, so annotate the validator, or the function, with a type:

```ts
import { stringSchema } from 'juniper';
import { makeValidator, type AssertionType, type JuniperValidator } from 'juniper-validator';

const schema = stringSchema().minLength(1);
declare const input: unknown;
declare const other: unknown;
// ---cut---
const validator: JuniperValidator<string> = makeValidator(schema);
validator.assert(input);
console.log(input);
//          ^?

const assertBar: AssertionType<typeof validator> = validator.assert;
assertBar(other);
console.log(other);
//          ^?
```

Without one, TypeScript rejects the call:

```ts
// @errors: 2775
import { stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

declare const input: unknown;
// ---cut---
const { assert } = makeValidator(stringSchema());
assert(input);
```

The thrown `Error` has the message `Value does not match schema`, and Ajv's [error objects](https://ajv.js.org/api.html#error-objects) as its `cause`.

## Plain JSON Schemas

`makeValidator` also takes a rendered JSON Schema object, such as one loaded from a file. Its type is whatever the `JsonSchema` is typed as, so an untyped object validates to `unknown`:

```ts
import { stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const json = stringSchema().toJSON();
//    ^?
const fromJuniper = makeValidator(json);
//    ^?

const fromFile = makeValidator(JSON.parse('{ "type": "string" }'));
//    ^?
```

## Next steps

- [Standard Schema](/juniper-validator/guides/standard-schema): use a validator with any library that accepts Standard Schema.
- [API reference](/juniper-validator/reference/api): Ajv options, formats and utility types.

<div style="text-align:center">

# Juniper Arbitrary
fast-check arbitraries from Juniper schemas.

[![npm package](https://badge.fury.io/js/juniper-arbitrary.svg)](https://www.npmjs.com/package/juniper-arbitrary)
[![License](https://img.shields.io/npm/l/juniper-arbitrary.svg)](https://github.com/JacobLey/leyman/blob/main/apps/juniper-arbitrary/LICENSE)

</div>

- **Valid by construction, then checked** — generators aim at each keyword, and a validator has the last word, so a value that comes out always validates.
- **Typed** — `makeArbitrary(schema)` is an `Arbitrary` of the schema's `SchemaType`.
- **Fails loudly** — a schema nothing matches throws with the path to the part responsible, where a plain `.filter()` would hang.
- **Plain JSON** — values survive a JSON round trip unchanged: no `-0`, `undefined` or null-prototype objects.

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/juniper-arbitrary/).

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Also See](#also-see)

## Install

```sh
npm i --save-dev juniper-arbitrary fast-check juniper
```

`fast-check` (`^4.0.0`) and `juniper` are required peer dependencies. Requires Node 24 or later. `ajv` and `ajv-formats` are installed with this package.

## Example

```ts
import * as fc from 'fast-check';
import { numberSchema, objectSchema, stringSchema } from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';

const user = objectSchema({
    properties: {
        email: stringSchema().format('email'),
        age: numberSchema().type('integer').minimum(0),
    },
    required: ['email'],
});

fc.assert(
    fc.property(makeArbitrary(user), value => {
        // value is typed { email: string; age?: number }
        return decode(encode(value)).email === value.email;
    })
);
```

## Usage

Every JSON Schema keyword Juniper emits is covered. How each is handled decides how fast generation is, never whether a value is valid:

| Keywords | Handling |
|---|---|
| `type`, `enum`, `const`, numeric bounds, `multipleOf`, `minLength`, `maxLength`, `minItems`, `maxItems`, `uniqueItems`, `items`, `prefixItems`, `contains`, `minContains`, `properties`, `required`, `additionalProperties`, `patternProperties`, `propertyNames`, `minProperties`, `dependentRequired`, `dependentSchemas` | Generated directly. |
| `pattern` | Generated from the regular expression. Several combine when they can (`startsWith()`, `contains()`, `endsWith()`). Lookaround is removed first, since fast-check can't generate from it. |
| `format` | Generated for every format Juniper knows by name. Any other is a plain string. |
| `allOf`, `anyOf`, `$ref`, recursion | Resolved, then generated directly. `anyOf` reaches every branch. |
| `oneOf`, `if`/`then`/`else` | Each branch is generated, and values matching too many are dropped. |
| `not`, `unevaluatedItems`, `unevaluatedProperties`, `maxContains`, `maxProperties` | Values that don't match are dropped. |

Some shapes are deliberately limited:

- **Objects get a few undeclared properties** unless `additionalProperties` says otherwise, since a real payload can have them.
- **Recursion stops a few levels deep**, as each level multiplies the size of a value.
- **Numbers mix doubles with integers**, since doubles alone are nearly all huge or tiny.
- **A schema with a great many conditionals** only reaches its first 64 combinations.

A value is rejected up to 1000 times in a row before generation gives up, which only happens for a schema random values rarely satisfy, such as a backreference in a `pattern`. Use a simpler schema, or a hand-written arbitrary with `.chain()`, for that part.

## API

### `makeArbitrary(schema)`

| Parameter | Type | Description |
|---|---|---|
| `schema` | `Schema<T>` | Any Juniper schema. |

Returns `Arbitrary<T>`. Values are generated from the same seed the same way, so a fast-check failure replays. Its shrinking stays valid.

Throws while building, and while generating when the schema can only be found out by trying.

### Errors

Each has `path`, a JSON Pointer to the part of the schema responsible (`#/properties/name`), and extends `JuniperArbitraryError`.

| Error | Thrown when |
|---|---|
| `UnsatisfiableSchemaError` | Nothing matches (`neverSchema()`, `minimum` above `maximum`, recursion with no way out), or no valid value turned up in time. |
| `UnsupportedSchemaError` | The schema doesn't compile, such as a `$ref` from `.ref()` to something outside it. Use `.define()` for definitions a schema should carry. |

## Also See

- [`juniper`](https://www.npmjs.com/package/juniper): builds the schemas.
- [`juniper-validator`](https://www.npmjs.com/package/juniper-validator): validates values against them.
- [`fast-check`](https://www.npmjs.com/package/fast-check): runs the properties.

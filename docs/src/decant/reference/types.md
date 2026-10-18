---
description: How each JSON Schema keyword becomes a TypeScript type, and what decant keeps that other generators lose.
---

# Type mapping

| JSON Schema | TypeScript |
|---|---|
| `true`, `{}` | `unknown` |
| `false`, `{ "not": {} }` | `never` |
| `type` | `string`, `number` (also `integer`), `boolean`, `null`; a `type` array is a union |
| `pattern` of a literal prefix, suffix or substring (`^abc`, `abc$`, `abc`) | `` `abc${string}` ``, `` `${string}abc` ``, `` `${string}abc${string}` `` |
| any other `pattern`, `format`, lengths, ranges | the plain type, as TypeScript can't express them |
| `enum`, `const` | literal types, including objects and arrays |
| `items` | `T[]` |
| `items` + `minItems` up to 3 | `[T, ...T[]]`, with `minItems` leading items. Larger values stay `T[]` (see `typedMinItems`) |
| `prefixItems` + `items: false` | `[A, B]`, with items beyond `minItems` optional |
| `prefixItems` + `items` | `[A, B, ...T[]]` |
| draft 7 `items` array + `additionalItems` | same as `prefixItems` + `items` |
| `properties` + `required` | `{ a: A; b?: B }` |
| `additionalProperties: true` / schema | `[key: string]: unknown` / `T` |
| `patternProperties` | an index signature, keyed by `` `x-${string}` `` for a literal prefix like `^x-`, or `string` otherwise |
| `type: "object"` with no properties | `Record<string, unknown>` |
| `dependentRequired`, `dependentSchemas`, draft 7 `dependencies` | `{ a?: never } \| { b: B }` |
| `allOf` | intersection |
| `anyOf`, `oneOf` | union |
| `if` / `then` / `else` | `(If & Then) \| Else` |
| `not` of `null` or literal values | removes them from a union; any other `not` leaves the type |
| `$ref` | the referenced named type |
| `propertyNames` with a literal prefix or `enum` | the keys of `additionalProperties`: `` `x-${string}` ``, or optional properties `a`, `b` |
| `title`, `description`, `deprecated` | JSDoc |
| `default`, `examples`, `format`, and constraints such as `minLength` or `maximum` | JSDoc tags, e.g. `@minLength 3`, so editors show them |

Subschemas of `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else` and `not` without a `type` of their own apply to their parent's types, as Juniper writes them. So `{ "type": ["string", "null"], "allOf": [{ "pattern": "^a" }] }` is `` `a${string}` | null ``.

Without `additionalProperties`, an object type has no index signature: TypeScript objects already allow other keys, and reading an undeclared key stays an error.

## Not supported

- `$ref` to another file (`other.json#/...`), to an anchor, `$dynamicRef` and `$recursiveRef` throw `DecantUnsupportedError`.
- `unevaluatedProperties`, `unevaluatedItems` and `contains` are accepted, but don't change the type.
- OpenAPI's `discriminator` is accepted, but not checked against the `oneOf` branches. The branches still narrow on the property as a union does.
- Swagger 2.0 documents.


## Precise types

Where other generators commonly lose type information, decant keeps it:

| Schema | decant | Often generated instead |
|---|---|---|
| `prefixItems: [{ number }, { number }]`, `items: false` | `[number, number]` | `never[]`, `any[]`, or `[number, number, ...number[]]` |
| `oneOf` of objects with a `kind` const | a union that narrows on `kind` | one object, with each branch's properties optional, or `any` |
| `pattern: "^usr_"` | `` `usr_${string}` `` | `string` |
| `patternProperties: { "^x-": string }`, `additionalProperties: false` | `` { [key: `x-${string}`]: string } `` | `{ [k: string]: unknown }`, or `string` for every key |
| recursive `$defs` | recursive named types | `any` after a few levels, or `undefined` |
| `enum: ["a", 42, null]` | `"a" \| 42 \| null` | `string \| number \| null` |

Each row is one of the probes in [WHY-DECANT.md](/decant/why#compared-to-alternatives), which compares decant with five other tools on the same schema.

## Stability of generated files

The text of a generated file is not part of decant's API. Formatting, ordering, and how a type is written (e.g. `Record<string, number>` or `{ [key: string]: number }`) may change in any release.

The types TypeScript reads from it are. A change that makes a generated type accept or reject different values, or read differently (such as a union becoming an intersection), is a breaking change.

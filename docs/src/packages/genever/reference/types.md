---
description: How each JSON Schema keyword becomes a TypeScript type, and what genever keeps that other generators lose.
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
| `$ref` | the referenced named type. It resolves against the nearest `$id`, so `#/$defs/A` inside an embedded resource is that resource's `A`, and may name an `$anchor` |
| draft-04 `id`, and boolean `exclusiveMinimum`/`exclusiveMaximum` | in a schema whose `$schema` is draft-04, or inside one: `id` names a resource as `$id` does, and the booleans make `minimum` and `maximum` exclusive. Elsewhere, `id` is an unknown keyword |
| `propertyNames` with a literal prefix or `enum` | the keys of `additionalProperties`: `` `x-${string}` ``, or optional properties `a`, `b` |
| `title`, `description`, `deprecated` | JSDoc |
| `default`, `examples`, `format`, and constraints such as `minLength` or `maximum` | JSDoc tags, e.g. `@minLength 3`, so editors show them |

Subschemas of `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else` and `not` without a `type` of their own apply to their parent's types, as Juniper writes them. So `{ "type": ["string", "null"], "allOf": [{ "pattern": "^a" }] }` is `` `a${string}` | null ``.

Without `additionalProperties`, an object type has no index signature: TypeScript objects already allow other keys, and reading an undeclared key stays an error.

## Not supported

- `$dynamicRef` and `$recursiveRef` throw `GeneverUnsupportedError`. `genever()` only reads one document, so with it, a `$ref` to another file does too. The CLI and `geneverFile` load referenced files and URLs: see [References to other files](/packages/genever/guides/references). References may use `$id` and `$anchor`.
- `unevaluatedProperties`, `unevaluatedItems` and `contains` are accepted, but don't change the type.
- `discriminator` is accepted in plain JSON Schema too, since [Juniper](/packages/juniper/guides/openapi#discriminated-unions) and Ajv use it there, and doesn't change the type: the branches narrow on the property as a union does. [Strict mode](/packages/genever/guides/strict-mode) checks it can tell the branches apart.
- Swagger 2.0 documents.
- An OpenAPI document's `webhooks` and operations' `callbacks` have no types, though their schemas in `components` do.


## Precise types

Where other generators commonly lose type information, genever keeps it:

| Schema | genever | Often generated instead |
|---|---|---|
| `prefixItems: [{ number }, { number }]`, `items: false` | `[number, number]` | `never[]`, `any[]`, or `[number, number, ...number[]]` |
| `oneOf` of objects with a `kind` const | a union that narrows on `kind` | one object, with each branch's properties optional, or `any` |
| `pattern: "^usr_"` | `` `usr_${string}` `` | `string` |
| `patternProperties: { "^x-": string }`, `additionalProperties: false` | `` { [key: `x-${string}`]: string } `` | `{ [k: string]: unknown }`, or `string` for every key |
| recursive `$defs` | recursive named types | `any` after a few levels, or `undefined` |
| `enum: ["a", 42, null]` | `"a" \| 42 \| null` | `string \| number \| null` |

Each row is one of the probes in [WHY-GENEVER.md](/packages/genever/why#compared-to-alternatives), which compares genever with five other tools on the same schema.

## Stability of generated files

The text of a generated file is not part of genever's API. Formatting, ordering, and how a type is written (e.g. `Record<string, number>` or `{ [key: string]: number }`) may change in any release.

The types TypeScript reads from it are. A change that makes a generated type accept or reject different values, or read differently (such as a union becoming an intersection), is a breaking change.

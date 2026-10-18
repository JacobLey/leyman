---
description: Why decant generates types rather than inferring them, how it compares to other generators, and its design decisions.
---

# Why decant?

## The problem

[Juniper](/juniper/) builds a JSON Schema and its TypeScript type together. That works while the schema stays in the program that defined it. But schemas travel: an API publishes its OpenAPI spec, a service shares a JSON Schema file, a config format ships its schema to editors. Whoever reads that file gets a plain JSON object, and none of the types.

The same is true of every schema library (zod, TypeBox, valibot): types live in the TypeScript that built the schema, not in the JSON it emits. Juniper's escape hatch, `customSchema<T>()`, takes a type you write by hand, which is exactly the type you wanted to stop maintaining.

decant closes that gap. Point it at a schema file, and it writes the types. For a schema built with Juniper, they are the types Juniper inferred, so you get them back after the schema has been serialized and read somewhere else.

## Generating, not inferring

There are two ways to get types from a JSON Schema:

- **Inference**, by a TypeScript type that reads the schema (`FromSchema<typeof schema>` in [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts), `Static` in TypeBox). Nothing to run, but the schema must be written in TypeScript `as const`. TypeScript widens an imported `.json` file (`"type": "string"` becomes `type: string`), and there is no way to import JSON `as const`. A schema that arrives as a file, which is the whole problem, gets `unknown`. Type-level parsing is also slow, and hits TypeScript's recursion limits on real schemas.
- **Generation**, by a tool that reads the file and writes TypeScript. It needs a build step, but works on any file, and the output is ordinary types: fast to check, readable in a diff, and with no runtime dependency.

decant generates. Run it once, commit the output, and `--ci` keeps it in sync.

## Compared to alternatives

Each tool was given the same schema, built with Juniper: `$defs`, a recursive definition, nullable properties, an `enum` of mixed types, a tuple (`prefixItems` with `items: false`), a `oneOf` of objects, `patternProperties` with `additionalProperties: false`, a `^usr_` pattern and `dependentRequired`. Its type was then checked against valid values, invalid values, and reads (21 probes).

| | decant | Juniper (built in TypeScript) | json-schema-to-typescript | quicktype | json-schema-to-zod | json-schema-to-ts | TypeBox `XStatic` |
|---|---|---|---|---|---|---|---|
| Probes passed | 21 / 21 | 21 / 21 | 15 / 21 | 12 / 21 | 15 / 21 | 14 / 21 | 16 / 21 |
| Tuple | `[number, number]` | `[number, number]` | `never[]` (rejects valid values) | `[number, number, ...number[]]` | `any[]` | `[]` | `never[] & [number, number]` (rejects valid values) |
| `oneOf` objects | narrows | narrows | narrows | merged into one object | `any` | narrows | narrows |
| `$ref` / recursion | ✅ | ✅ | ✅ | ✅ | `any` | recursion is `undefined` | `any` after 3 levels |
| Closed `patternProperties` | `` `x-${string}` `` keys | `` `x-${string}` `` keys | open `[k: string]: unknown` | dropped | every key typed `string`, rejects valid objects | open | every key typed `string`, rejects valid objects |
| `^usr_` pattern | `` `usr_${string}` `` | `` `usr_${string}` `` | `string` | `string` | `string` | `string` | `string` |
| From a `.json` file | ✅ | — | ✅ | ✅ | ✅ | `unknown` | wrong types |

json-schema-to-ts also failed outright ("Type instantiation is excessively deep") on the schemastore schemas for `package.json` and GitHub workflows.

## Design decisions

### Output is plain types

decant writes `export type` declarations, not Juniper builder code. Recursive schemas would need hand-written interfaces as builder code anyway, and types alone keep generated files free of runtime dependencies, and fast to type-check.

### Tested by round trip

The test suite builds schemas with Juniper, serializes them to JSON text, decants them, and checks the generated type against Juniper's `SchemaType` with TypeScript's own identity check. Where decant deliberately differs (where the JSON says more than Juniper's type does), the difference is its own test. The round trip already found a case where Juniper's emitted JSON disagrees with its type.

### Types are the API, text is not

Tests never compare generated text, only the types TypeScript reads. A formatting change, or writing `Record<string, number>` instead of `{ [key: string]: number }`, is not a breaking change. A generated type that accepts different values, or reads differently, is.

### Strict, like Juniper

A schema can be valid JSON Schema and still be a mistake: `maxLength` on a number, a misspelled keyword, a `required` property that was never declared, `minLength` over `maxLength`. Validators ignore these, so the schema silently accepts more, or less, than intended. decant fails on them by default, with a JSON Pointer to the problem, as Juniper refuses to build them. Every schema Juniper builds passes. Strict mode can be disabled for schemas you don't control. The type then follows what a validator accepts, and is never narrower: a schema without a `type` accepts every type, and a contradiction accepts nothing (`never`).

## Non-goals

- **Validation.** decant generates types; it doesn't check data. Use [Ajv](https://ajv.js.org/) or [juniper-validator](/juniper-validator/) with the same schema.
- **Constraints TypeScript can't express.** `minLength`, `maximum`, `format` and most patterns have no type. They stay in the schema.
- **A general-purpose bundler.** Referenced files are loaded with a small loader built on decant's own `$id` and `$anchor` resolution, which only covers what decant reads. Of six existing resolvers tested, only one resolved `$anchor` and embedded `$id` correctly, and using it meant two resolvers that could disagree, so decant has one.

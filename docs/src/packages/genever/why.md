---
description: Why genever generates types rather than inferring them, how it compares to other generators, and its design decisions.
---

# Why genever?

## The problem

[Juniper](/packages/juniper/) builds a JSON Schema and its TypeScript type together. That works while the schema stays in the program that defined it. But schemas travel: an API publishes its OpenAPI spec, a service shares a JSON Schema file, a config format ships its schema to editors. Whoever reads that file gets a plain JSON object, and none of the types.

The same is true of every schema library (zod, TypeBox, valibot): types live in the TypeScript that built the schema, not in the JSON it emits. Juniper's escape hatch, `customSchema<T>()`, takes a type you write by hand, which is exactly the type you wanted to stop maintaining.

genever closes that gap. Point it at a schema file, and it writes the types. For a schema built with Juniper, they are the types Juniper inferred, so you get them back after the schema has been serialized and read somewhere else.

## Generating, not inferring

There are two ways to get types from a JSON Schema:

- **Inference**, by a TypeScript type that reads the schema (`FromSchema<typeof schema>` in [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts), `Static` in TypeBox). Nothing to run, but the schema must be written in TypeScript `as const`. TypeScript widens an imported `.json` file (`"type": "string"` becomes `type: string`), and there is no way to import JSON `as const`. A schema that arrives as a file, which is the whole problem, gets `unknown`. Type-level parsing is also slow, and hits TypeScript's recursion limits on real schemas.
- **Generation**, by a tool that reads the file and writes TypeScript. It needs a build step, but works on any file, and the output is ordinary types: fast to check, readable in a diff, and with no runtime dependency.

genever uses generation. Run it once, commit the output, and `--ci` keeps it in sync.

## Compared to alternatives

The [comparison page](/packages/genever/comparison) shows a report from last night's run: genever and the top tools for generating types, on the same documents, with each type checked against valid values, invalid values and reads, and the time to generate. The numbers are there rather than here, so they stay current.

The differences come up most in features JSON Schema has and TypeScript can express, but most generators leave wider than they could be: tuples, closed `patternProperties`, literal patterns and `dependentRequired`.

## Design decisions

### Output is plain types

genever writes `export type` declarations, not Juniper builder code. Recursive schemas would need hand-written interfaces as builder code anyway, and types alone keep generated files free of runtime dependencies, and fast to type-check.

### Tested by round trip

The test suite builds schemas with Juniper, serializes them to JSON text, generates types from that, and checks the generated type against Juniper's `SchemaType` with TypeScript's own identity check. Where genever deliberately differs (where the JSON says more than Juniper's type does), the difference is its own test. The round trip already found a case where Juniper's emitted JSON disagrees with its type.

### Tests compare types

Tests never compare generated text, only the types TypeScript reads. A formatting change, or writing `Record<string, number>` instead of `{ [key: string]: number }`, is not a breaking change. A generated type that accepts different values, or reads differently, is.

### Strict, like Juniper

A schema can be valid JSON Schema and still be a mistake: `maxLength` on a number, a misspelled keyword, a `required` property that was never declared, `minLength` over `maxLength`. Validators ignore these, so the schema silently accepts more, or less, than intended. genever fails on them by default, with a JSON Pointer to the problem, as Juniper refuses to build them. Every schema Juniper builds passes. Strict mode can be disabled for schemas you don't control. The type then follows what a validator accepts, and is never narrower: a schema without a `type` accepts every type, and a contradiction accepts nothing (`never`).

## Non-goals

- **Validation.** genever generates types; it doesn't check data. Use [Ajv](https://ajv.js.org/) or [juniper-validator](/packages/juniper-validator/) with the same schema.
- **Constraints TypeScript can't express.** `minLength`, `maximum`, `format` and most patterns have no type. They stay in the schema.
- **A general-purpose bundler.** Referenced files are loaded with a small loader built on genever's own `$id` and `$anchor` resolution, which only covers what genever reads. Of six existing resolvers tested, only one resolved `$anchor` and embedded `$id` correctly, and using it meant two resolvers that could disagree, so genever has one.

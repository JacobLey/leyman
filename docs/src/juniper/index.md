---
description: Build JSON Schemas in TypeScript with inferred static types — strict, Ajv-ready, JSON Schema 2020-12 and OpenAPI 3.0 output.
---

# Juniper

Build JSON Schemas in TypeScript with inferred static types: strict, Ajv-ready, with JSON Schema 2020-12 and OpenAPI 3.0 output.

```ts
import { objectSchema, stringSchema, type SchemaType } from 'juniper';

const user = objectSchema({
    properties: {
        id: stringSchema({ format: 'uuid' }),
        handle: stringSchema({ maxLength: 20 }).startsWith('@'),
        bio: stringSchema().nullable(),
    },
    required: ['id', 'handle'],
    additionalProperties: false,
});

type User = SchemaType<typeof user>;
//   ^?
```

Hover over any identifier in the examples on this site to see its inferred type. Every example is type-checked against Juniper's published types when the site is built.

**[Get started →](/juniper/getting-started)** · [Why Juniper?](/juniper/why)

## Features

- **One source of truth**: Write the schema once, get its TypeScript type with `SchemaType<typeof schema>`. Nothing to keep in sync.
- **Mistakes are compile errors**: Each schema type only exposes the keywords that apply to it, so `maxLength` on an array or a `required` key missing from `properties` fails to build instead of silently validating everything.
- **Strict output**: Emitted schemas pass [Ajv's strict mode](https://ajv.js.org/strict-mode.html), so they work with any standard JSON Schema validator.
- **Multiple targets**: Emit JSON Schema 2020-12 (and OpenAPI 3.1), or OpenAPI 3.0's `nullable` dialect, from the same definition.
- **Reusable definitions**: `.define('User')` emits a schema as a `$ref` and bundles it into `$defs` or OpenAPI `components` automatically, so references never dangle.
- **Immutable builders**: Every method returns a new schema, so shared base schemas are safe to reuse, narrow with `pick`, `omit` and `partial`, or combine with `extend`.

## Compared to

- [TypeBox](https://www.npmjs.com/package/@sinclair/typebox) also builds JSON Schema and types together, but focuses on covering JSON Schema rather than rejecting schemas that don't make sense.
- [zod](https://zod.dev/) and [joi](https://www.npmjs.com/package/joi) are validation libraries with their own schema formats; JSON Schema is an export, not the source.
- [typescript-json-schema](https://www.npmjs.com/package/typescript-json-schema) and [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) are code generators that convert one way between TypeScript and JSON Schema, and can't stop you authoring a bad schema.

Juniper builds schemas; it does not validate data. Pair it with [Ajv](https://ajv.js.org/) or [juniper-validator](/juniper-validator/).

---
description: Build JSON Schemas in TypeScript with inferred static types — strict, Ajv-ready, JSON Schema 2020-12 and OpenAPI 3.0 output.
---

# Juniper

<ProjectHeader />

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

**[Get started →](/packages/juniper/getting-started)** · [Why Juniper?](/packages/juniper/why)

## Features

- **One source of truth**: Write the schema once, get its TypeScript type with `SchemaType<typeof schema>`. Nothing to keep in sync.
- **Mistakes are compile errors**: Each schema type only exposes the keywords that apply to it, so `maxLength` on an array or a `required` key missing from `properties` fails to build instead of silently validating everything.
- **Strict, deterministic output**: Emitted schemas pass [Ajv's strict mode](https://ajv.js.org/strict-mode.html), with no unknown or misapplied keywords, and render the same JSON every time, so a committed spec only changes when a schema does.
- **Multiple targets**: Emit JSON Schema 2020-12 (and OpenAPI 3.1), or OpenAPI 3.0, from the same definition. Keywords 3.0 lacks are rewritten where possible, and dropped otherwise.
- **Standard JSON Schema**: Every schema implements [Standard JSON Schema](https://standardschema.dev/), so tools that accept it can take Juniper schemas directly.
- **Reusable definitions**: `.define('User')` emits a schema as a `$ref` and bundles it into `$defs` or OpenAPI `components` automatically, so references never dangle.
- **Immutable builders**: Every method returns a new schema, so shared base schemas are safe to reuse, narrow with `pick`, `omit` and `partial`, or combine with `extend`.

## Compared to

- [TypeBox](https://www.npmjs.com/package/typebox) also builds JSON Schema and types together, and ships a validator. But its options accept any keyword, so `maxLength` on an array compiles, and it has no OpenAPI 3.0 output.
- [zod](https://zod.dev/), [Valibot](https://valibot.dev/) and [joi](https://www.npmjs.com/package/joi) are validation libraries with their own schema formats. Zod and Valibot export JSON Schema, but refinements and transforms don't carry over, so the export isn't the source of truth.
- [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) and [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) derive types from a plain JSON Schema, so nothing checks the schema itself.
- [ts-json-schema-generator](https://www.npmjs.com/package/ts-json-schema-generator) goes the other way, generating JSON Schema from TypeScript types as a build step, with constraints like `maxLength` written as unchecked JSDoc tags.

Juniper builds schemas; it does not validate data. Pair it with [Ajv](https://ajv.js.org/) or [juniper-validator](/packages/juniper-validator/). To get Juniper's types back from a schema serialized elsewhere, generate them with [genever](/packages/genever/).

## Related

<ProjectRelated />

---
description: A JSON Schema builder for TypeScript that infers each schema's type and catches schema mistakes at compile time, with JSON Schema 2020-12 and OpenAPI 3.0 output.
---

# Juniper

<ProjectHeader />

Writing JSON Schemas by hand has two problems. Validators accept almost any schema, so a keyword on the wrong type or a typo in `required` goes unnoticed, and the TypeScript type for the same data has to be kept in sync separately. Juniper builds JSON Schemas in TypeScript, where those mistakes are compile errors, and infers the type of the data each schema accepts.

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

- `SchemaType<typeof schema>` gives a schema's TypeScript type, so you write the shape once and there is nothing to keep in sync.
- Each schema type only exposes the keywords that apply to it. `maxLength` on an array, or a `required` key missing from `properties`, fails to build instead of quietly changing what the schema accepts.
- Emitted schemas pass [Ajv's strict mode](https://ajv.js.org/strict-mode.html), and render the same JSON every time, so a committed spec only changes when a schema does.
- One definition renders as JSON Schema 2020-12 (also used by OpenAPI 3.1) or as OpenAPI 3.0. Keywords 3.0 lacks are rewritten where possible, and dropped otherwise.
- Every schema implements [Standard JSON Schema](https://standardschema.dev/), so tools that accept it can take Juniper schemas directly.
- `.define('User')` emits a schema as a `$ref` and adds it to `$defs` or OpenAPI `components` for you.
- Every method returns a new schema, so a shared base schema is safe to reuse, narrow with `pick`, `omit` and `partial`, or combine with `extend`.

## Compared to

- [TypeBox](https://www.npmjs.com/package/typebox) also builds JSON Schema and types together, and ships a validator. But its options accept any keyword, so `maxLength` on an array compiles, and it has no OpenAPI 3.0 output.
- [zod](https://zod.dev/), [Valibot](https://valibot.dev/) and [joi](https://www.npmjs.com/package/joi) are validation libraries with their own schema formats. Zod and Valibot export JSON Schema, but refinements and transforms don't carry over, so the export isn't the source of truth.
- [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) and [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) derive types from a plain JSON Schema, so nothing checks the schema itself.
- [ts-json-schema-generator](https://www.npmjs.com/package/ts-json-schema-generator) goes the other way, generating JSON Schema from TypeScript types as a build step, with constraints like `maxLength` written as unchecked JSDoc tags.

Juniper builds schemas, and doesn't validate data. Pair it with [Ajv](https://ajv.js.org/) or [juniper-validator](/packages/juniper-validator/). To get Juniper's types back from a schema serialized elsewhere, generate them with [genever](/packages/genever/).

## Related

<ProjectRelated />

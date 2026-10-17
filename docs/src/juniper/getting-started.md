---
description: Install Juniper, build a schema, and validate data with it.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i juniper
```

```sh [pnpm]
pnpm add juniper
```

```sh [yarn]
yarn add juniper
```

:::

::: tip
Juniper is ESM only, and requires Node.js 24 or later. From CommonJS, load it with a dynamic
import: `const { stringSchema } = await import('juniper');`
:::

## Build a schema

Every schema has a functional constructor, like `objectSchema()` and `stringSchema()`. Nest them to describe your data, and get its TypeScript type with `SchemaType`:

```ts
import { objectSchema, stringSchema, type SchemaType } from 'juniper';

const schema = objectSchema({
    properties: {
        foo: stringSchema({ maxLength: 10 }).startsWith('abc'),
        bar: stringSchema().nullable(),
        anything: true,
    },
    required: ['foo'],
    additionalProperties: false,
});

type Foo = SchemaType<typeof schema>;
//   ^?
```

`toJSON()` renders the JSON Schema document:

```ts
import { objectSchema, stringSchema } from 'juniper';

const schema = objectSchema({
    properties: {
        foo: stringSchema({ maxLength: 10 }).startsWith('abc'),
        bar: stringSchema().nullable(),
        anything: true,
    },
    required: ['foo'],
    additionalProperties: false,
});
// ---cut---
schema.toJSON();
// {
//     type: 'object',
//     properties: {
//         foo: { type: 'string', maxLength: 10, pattern: '^abc' },
//         bar: { type: ['string', 'null'] },
//         anything: true,
//     },
//     required: ['foo'],
//     additionalProperties: false,
// }
```

## Validate data

Juniper builds schemas; it does not validate data. Pass the output to any JSON Schema validator.

Juniper writes the `format` keyword as given, and does not check it. If a schema uses `format`, use a validator that supports the formats you need: [juniper-validator](/juniper-validator/) does, and Ajv needs [ajv-formats](https://www.npmjs.com/package/ajv-formats).

### With juniper-validator

[juniper-validator](/juniper-validator/) wraps Ajv, and implements [Standard Schema](https://standardschema.dev/), so it works with any library that accepts standard validators.

```ts
import { objectSchema, stringSchema } from 'juniper';

const schema = objectSchema({
    properties: {
        foo: stringSchema({ maxLength: 10 }).startsWith('abc'),
    },
    required: ['foo'],
});
declare const input: unknown;
// ---cut---
import { makeValidator } from 'juniper-validator';

const validator = makeValidator(schema);

if (validator.is(input)) {
    console.log(input.foo);
    //                ^?
}
```

### With Ajv

Ajv's `compile` takes the schema's type as a generic, so the validator narrows its input too:

```ts
import { objectSchema, stringSchema, type SchemaType } from 'juniper';

const schema = objectSchema({
    properties: {
        foo: stringSchema({ maxLength: 10 }).startsWith('abc'),
    },
    required: ['foo'],
});
declare const input: unknown;
// ---cut---
import { Ajv2020 } from 'ajv/dist/2020.js';

const validate = new Ajv2020({ strict: true }).compile<SchemaType<typeof schema>>(
    schema.toJSON()
);

if (validate(input)) {
    console.log(input.foo);
    //                ^?
}
```


## Mistakes are compile errors

Juniper is opinionated about schemas that can't be right. Each schema only exposes the keywords that apply to it:

```ts
// @errors: 2339
import { arraySchema } from 'juniper';

arraySchema().maxLength(10);
```

Keys in `required` must exist in `properties`, so a typo doesn't quietly make a schema reject everything:

```ts
// @errors: 2322
import { objectSchema, stringSchema } from 'juniper';

objectSchema({
    properties: { fooBar: stringSchema() },
    required: ['foobar'],
});
```

And schemas that can never match, like an object that must also be a string, are rejected:

```ts
// @errors: 2345
import { objectSchema, stringSchema } from 'juniper';

objectSchema().allOf([stringSchema()]);
```

::: warning
Most of these checks happen only in TypeScript. In JavaScript the same code may run, and emit a
nonsensical schema.
:::

## Constructors and immutability

Every schema is a class, with three equivalent ways to create it:

```ts
import { StringSchema, stringSchema } from 'juniper';

const schema1 = new StringSchema({ maxLength: 10 });
const schema2 = StringSchema.create({ maxLength: 10 });
const schema3 = stringSchema({ maxLength: 10 });

schema3 instanceof StringSchema; // true
```

Every option can also be set with a method of the same name. Schemas are **immutable**: each method returns a new schema and leaves the original alone, so a shared base schema is safe to build on.

```ts
import { numberSchema } from 'juniper';

const integer = numberSchema({ type: 'integer' });
const multipleOfFive = integer.multipleOf(5);

integer.toJSON(); // { type: 'integer' }
multipleOfFive.toJSON(); // { type: 'integer', multipleOf: 5 }
```

## Next steps

- [Reusing schemas](/juniper/guides/reusing-schemas) with `define`, including recursive schemas.
- [Deriving object schemas](/juniper/guides/deriving-object-schemas) for create, update and response shapes.
- [OpenAPI](/juniper/guides/openapi) components and the 3.0 dialect.
- The [schema reference](/juniper/reference/schemas) lists every schema and keyword.

---
description: Build create, update and response variants of a resource with pick, omit, partial, required and extend.
---

# Deriving object schemas

An API usually needs several shapes of the same resource: what a client sends to create it, what it sends to update it, and what the server returns. Build them all from one schema.

## `pick`, `omit` and `partial`

```ts
import { numberSchema, objectSchema, stringSchema, type SchemaType } from 'juniper';

const user = objectSchema({
    properties: {
        id: numberSchema(),
        name: stringSchema(),
        email: stringSchema(),
    },
    required: ['id', 'name'],
    additionalProperties: false,
});

const createUser = user.omit(['id']);
type CreateUser = SchemaType<typeof createUser>;
//   ^?

const updateUser = createUser.partial();
type UpdateUser = SchemaType<typeof updateUser>;
//   ^?

// Only `name` is made optional
const summary = user.pick(['id', 'name']).partial(['name']);
type Summary = SchemaType<typeof summary>;
//   ^?
```

They only change `properties` and `required`. Every other keyword (`additionalProperties`, `title`, ...) is kept, so reset any that no longer fit.

Keys are checked against the schema's properties, so a typo is a compile error:

```ts
// @errors: 2820
import { numberSchema, objectSchema, stringSchema } from 'juniper';

const user = objectSchema({
    properties: { id: numberSchema(), name: stringSchema() },
    required: ['id', 'name'],
});
// ---cut---
user.omit(['ID']);
```

Constraints added by combining schemas (`allOf`, `if`, `dependentRequired`, ...) still apply to the result, in both the JSON Schema and its type. For example, a property required through `dependentRequired` stays required after `partial()`.

## `required`

`required()` with no keys marks every property as required, the inverse of `partial()`:

```ts
import { numberSchema, objectSchema, stringSchema, type SchemaType } from 'juniper';

const user = objectSchema({
    properties: {
        id: numberSchema(),
        name: stringSchema(),
        email: stringSchema(),
    },
    required: ['id', 'name'],
});
// ---cut---
const fullUser = user.required();
type FullUser = SchemaType<typeof fullUser>;
//   ^?
```

## `extend`

`extend` adds the properties of another object schema, such as fields shared by many resources. Duplicate properties are a compile error, and `required` is combined.

```ts
import { numberSchema, objectSchema, stringSchema, type SchemaType } from 'juniper';

const user = objectSchema({
    properties: {
        id: numberSchema(),
        name: stringSchema(),
        email: stringSchema(),
    },
    required: ['id', 'name'],
    additionalProperties: false,
});
// ---cut---
const timestamps = objectSchema({
    properties: { createdAt: stringSchema(), updatedAt: stringSchema() },
    required: ['createdAt'],
});

const storedUser = user.extend(timestamps);
type StoredUser = SchemaType<typeof storedUser>;
//   ^?
```

Unlike `allOf`, `additionalProperties` applies to the combined properties, so `storedUser` is still closed over all five.

- When the added schema sets `additionalProperties`, `unevaluatedProperties`, `minProperties` or `maxProperties`, its value replaces the original's, in both the JSON Schema and its type.
- `patternProperties`, `dependentRequired`, `dependentSchemas` and combined schemas (`allOf`, `if`, ...) of both apply.
- Annotations (`title`, ...), `nullable()` and `define()` come from the schema `extend` is called on.

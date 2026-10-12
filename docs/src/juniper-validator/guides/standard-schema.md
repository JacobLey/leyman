---
description: Use a Juniper schema anywhere that accepts a Standard Schema validator.
---

# Standard Schema

[Standard Schema](https://standardschema.dev/) is a shared interface for validators. Libraries that accept it, such as form libraries, router and API frameworks, and tRPC, can validate with any implementation without an adapter.

Every validator from `makeValidator` implements Standard Schema v1, so it can be passed directly:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

// Stands in for any library that accepts a Standard Schema validator
declare function parseBody<T>(validator: StandardSchemaV1<unknown, T>, body: unknown): T;

const userValidator = makeValidator(
    objectSchema({
        properties: { name: stringSchema() },
        required: ['name'],
    })
);

const user = parseBody(userValidator, { name: 'Ada' });
//    ^?
```

The library infers the output type from the validator, so it matches the schema.

## The `~standard` property

Libraries call `validator['~standard'].validate(value)`. It is the same function as [`validator.validate()`](/juniper-validator/getting-started#validate-issues), which is easier to call directly.

| Property | Value |
|----------|-------|
| `version` | `1` |
| `vendor` | `'juniper'` |
| `validate` | Returns `{ value }` when the value matches, or `{ issues }` when it doesn't. Always synchronous. |

## Issues

Each issue is one of Ajv's [error objects](https://ajv.js.org/api.html#error-objects), so it has Ajv's fields, like `instancePath` and `keyword`, as well as Standard Schema's `message`. Ajv doesn't fill Standard Schema's `path`, so libraries that show errors next to a field can't place them. Read `instancePath` (a [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901), like `/address/city`) to place them yourself.

Errors without a message are left out.

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
| `jsonSchema` | Renders the schema as JSON Schema. See [JSON Schema](#json-schema). |

## Issues

Each issue is one of Ajv's [error objects](https://ajv.js.org/api.html#error-objects), so it has Ajv's fields, like `instancePath` and `keyword`, as well as Standard Schema's `message` and `path`.

`path` lists the keys from the value down to the invalid part, so libraries that show errors next to a field can place them. Array indices are numbers. An issue for a missing property (`required` or `dependentRequired`), or an extra one (`additionalProperties` or `unevaluatedProperties`), is placed at that property, not the object:

```ts
import { arraySchema, numberSchema, objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const validator = makeValidator(
    objectSchema({
        properties: {
            name: stringSchema(),
            scores: arraySchema({ items: numberSchema() }),
        },
        required: ['name'],
    }),
    { allErrors: true }
);

validator.validate({ scores: [1, 'two'] }).issues?.map(issue => issue.path);
// [['name'], ['scores', 1]]
```

Ajv stops at the first issue unless `allErrors` is set, so set it to show every field's issue at once.

With Ajv's `messages: false`, each `message` is a generic one naming the keyword, like `must pass "type" keyword validation`.

## JSON Schema

The validator also implements [Standard JSON Schema](https://standardschema.dev/), so libraries that need both a JSON Schema and a validator, like tool and API definitions, can take the validator alone. `validator['~standard'].jsonSchema` is the same as the [Juniper schema's](/juniper/reference/api#standard), and supports the same targets.

A validator made from a rendered JSON Schema object returns that object for the `draft-2020-12` target, and throws for any other.

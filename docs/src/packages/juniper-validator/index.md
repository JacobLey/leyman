---
description: Standard Schema compliant validators for Juniper schemas, with type guards and assertions.
---

# Juniper Validator

<ProjectHeader />

Validate data against a [Juniper](/packages/juniper/) schema, and narrow it to the schema's type.

```ts
declare const input: unknown;
// ---cut---
import { objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const userSchema = objectSchema({
    properties: {
        name: stringSchema({ minLength: 1 }),
        email: stringSchema({ format: 'email' }),
    },
    required: ['name'],
    additionalProperties: false,
});

const validator = makeValidator(userSchema);

if (validator.is(input)) {
    console.log(input);
    //          ^?
}
```

**[Get started →](/packages/juniper-validator/getting-started)**

## Features

- `is()` and `assert()` narrow `unknown` to the schema's TypeScript type, with no type to write by hand.
- Validators implement [Standard Schema](https://standardschema.dev/), so they work with any library that accepts Standard Schema validators, such as form libraries and API frameworks. See [Standard Schema](/packages/juniper-validator/guides/standard-schema).
- Schemas are compiled with [Ajv](https://ajv.js.org/) in strict mode, and standard formats like `email`, `uuid` and `date-time` are validated.
- It takes a Juniper schema, or a rendered JSON Schema object.

## Related

<ProjectRelated />

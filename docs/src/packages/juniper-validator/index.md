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

- **Typed by the schema**: `is()` and `assert()` narrow `unknown` to the schema's TypeScript type, with no type to write by hand.
- **[Standard Schema](https://standardschema.dev/)**: Works with any library that accepts Standard Schema validators, such as form libraries and API frameworks. See [Standard Schema](/packages/juniper-validator/guides/standard-schema).
- **Strict Ajv underneath**: Compiles with [Ajv](https://ajv.js.org/) in strict mode, and validates standard formats like `email`, `uuid` and `date-time`.
- **Any JSON Schema**: Takes a Juniper schema, or a rendered JSON Schema object.

## Related

<ProjectRelated />

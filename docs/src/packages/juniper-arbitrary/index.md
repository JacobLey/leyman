---
description: fast-check arbitraries from Juniper schemas, for property-based tests with typed values that always validate.
---

# Juniper Arbitrary

<ProjectHeader />

Generate test values from a [Juniper](/packages/juniper/) schema, typed by it and always valid against it.

```ts
import * as fc from 'fast-check';
import { numberSchema, objectSchema, stringSchema } from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';

const user = objectSchema({
    properties: {
        email: stringSchema().format('email'),
        age: numberSchema().type('integer').minimum(0),
    },
    required: ['email'],
});

fc.assert(
    fc.property(makeArbitrary(user), value => {
        console.log(value);
        //          ^?
    })
);
```

**[Get started →](/packages/juniper-arbitrary/getting-started)**

## Features

- **Valid by construction, then checked**: Generators aim at each keyword, and a validator has the last word, so a value that comes out always validates.
- **Typed by the schema**: An `Arbitrary` of the schema's `SchemaType`, with no type to write by hand.
- **Fails loudly**: A schema nothing matches throws with the path to the part responsible, where a plain `.filter()` would hang.
- **Plain JSON**: Values survive a JSON round trip unchanged, with no `-0`, `undefined` or null-prototype objects.

## Related

<ProjectRelated />

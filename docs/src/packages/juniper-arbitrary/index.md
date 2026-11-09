---
description: fast-check arbitraries from Juniper schemas, for property-based tests with typed values that always validate.
---

# Juniper Arbitrary

<ProjectHeader />

Make a fast-check arbitrary from a [Juniper](/packages/juniper/) schema, for property-based tests. The values are typed by the schema, and each one is checked against it before your test sees it.

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

- Generators aim at each keyword, and a validator checks every value, so a generated value always validates.
- The arbitrary is typed as the schema's `SchemaType`.
- A schema nothing matches throws an error with the path to the part responsible.
- Values survive a JSON round trip unchanged, with no `-0`, `undefined` or null-prototype objects.

## Related

<ProjectRelated />

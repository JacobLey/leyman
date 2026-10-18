---
description: Get the types Juniper inferred back from the JSON Schema it emitted.
---

# Juniper round trip

[Juniper](/juniper/) builds a JSON Schema and its type together. Once the schema is serialized, to a file or into an OpenAPI spec, only the JSON is left. genever reads that JSON back into the type Juniper inferred:

```ts
import { arraySchema, objectSchema, stringSchema } from 'juniper';

const user = objectSchema({
    properties: {
        id: stringSchema().startsWith('usr_'),
        tags: arraySchema(stringSchema()).minItems(1),
    },
    required: ['id'],
});

// Written to user.json, then `genever user.json --name User` writes:
// export type User = {
//     id: `usr_${string}`;
//     tags?: [string, ...string[]];
// };
```

genever's tests build schemas covering every Juniper schema type and keyword, serialize them to JSON text, genever them, and check the generated type is equivalent to Juniper's `SchemaType`, in both JSON Schema 2020-12 and OpenAPI 3.0. Juniper's own escape hatch, `customSchema<T>()`, takes a hand-written type, which is the type genever saves you from maintaining.

## Differences

genever reads only the JSON. Where the JSON says more than Juniper's type does, or less, genever follows the JSON:

- An object schema with no properties is `Record<string, unknown>`, not Juniper's empty object type.
- Prefix items beyond `minItems` are optional, as a validator accepts a shorter array. Juniper's `tupleSchema()` always sets `minItems`, so its tuples are identical.
- In `if`/`then`/`else`, a property set to `false` in `else` is `?: never`.
- A type that only exists in TypeScript, from `.cast<T>()` or `customSchema<T>()`, is read from the JSON the schema emits instead.
- `minItems` is typed up to 3 by default, as in Juniper. genever's `--typed-min-items` changes the cap.

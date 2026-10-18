---
"juniper": minor
---

Add `.not(nullSchema())` to make a nullable schema non-nullable. It removes `null` from the type, and from the JSON Schema: `type: ['string', 'null']` becomes `type: 'string'`, or `not: { type: 'null' }` is emitted where there is no `type` (as on `mergeSchema()`). It is available on nullable string, number, object, array and tuple schemas, and on merge schemas. Previously the only way to remove `null` was `.not(stringSchema().nullable())`, which also rejects every string, so its JSON Schema accepted nothing.

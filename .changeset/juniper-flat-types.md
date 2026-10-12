---
"juniper": minor
---

Object types inferred by `SchemaType` (and by `mergeSchema`'s `allOf`, `anyOf`, `oneOf` and `if`) are now flattened into a single object type, so editors show `{ foo: string; bar?: number }` instead of `Partial<{ ... }> & Required<Pick<{ ... }, 'foo'>>`. Combined schemas show as a union of flat objects.

The types are equivalent to before: properties, optional modifiers and index signatures are unchanged, and values that were assignable still are. Only exact type assertions (e.g. `expect-type`'s `toEqualTypeOf`) see the new shapes. `EmptyObject` now displays by name.

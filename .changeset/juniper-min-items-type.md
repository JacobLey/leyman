---
"juniper": minor
---

`minItems` up to 3 is now part of an array's type: `arraySchema(stringSchema()).minItems(1)` is `[string, ...string[]]` rather than `string[]`. Building an array with fewer items than the schema allows is now a type error, as it already was a validation error. Prefix items count towards `minItems`. Larger values, or a `number` variable, leave the type as an array.

This is a type fix: every value the schema accepts is still assignable. Code that builds such arrays may need to narrow them first, e.g. with `(array): array is [T, ...T[]] => array.length > 0`, as a length check alone does not narrow an array.

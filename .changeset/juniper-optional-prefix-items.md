---
'juniper': major
---

Type prefix items beyond `minItems` as optional, since the schema accepts arrays without them: `arraySchema(stringSchema()).prefixItem(numberSchema())` is now `[number?, ...string[]]`, not `[number, ...string[]]`, which claimed a first item that `[]` doesn't have. Nothing changes at runtime, or for `tupleSchema()`.

To migrate, add `.minItems(n)` where the items must exist, which makes the schema enforce what the type promised. To keep the old type without changing what validates, use `.cast<[number, ...string[]]>()`.

---
description: makeArbitrary and the errors of juniper-arbitrary.
---

# API

## `makeArbitrary(schema)`

Creates a fast-check arbitrary of the values a schema accepts.

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `Schema<T>` | Any Juniper schema. |

**Returns** `Arbitrary<T>`, typed by the schema. Values are generated from the same seed the same way, so a fast-check failure replays. Its shrinking stays valid.

Throws while building, and while generating when the schema can only be found out by trying.

## Errors

Each has `path`, a JSON Pointer to the part of the schema responsible (`#/properties/name`), and extends `JuniperArbitraryError`.

| Error | Thrown when |
|-------|-------------|
| `UnsatisfiableSchemaError` | Nothing matches (`neverSchema()`, `minimum` above `maximum`, recursion with no way out), or no valid value turned up in time. |
| `UnsupportedSchemaError` | The schema doesn't compile, such as a `$ref` from `.ref()` to something outside it. Use `.define()` for definitions a schema should carry. |

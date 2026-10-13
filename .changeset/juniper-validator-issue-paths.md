---
"juniper-validator": minor
---

Fill each issue's Standard Schema `path`, so libraries that show errors next to a field can place them. It is read from Ajv's `instancePath`, with array indices as numbers, and an issue for a missing property (`required` or `dependentRequired`) is placed at that property.

`jsPropertySyntax` is no longer accepted in `makeValidator`'s options, so `instancePath` is always a JSON Pointer. The option is deprecated by Ajv.

---
'juniper': patch
---

Fix `toJSON({ openApi30: true })` rejecting keys that `patternProperties` allows. OpenAPI 3.0 has no such keyword, so it was dropped while `additionalProperties` stayed, leaving `additionalProperties: false` to reject every key the pattern covers. `additionalProperties` now also allows the pattern schemas' values, the way a tuple becomes an array of any of its items.

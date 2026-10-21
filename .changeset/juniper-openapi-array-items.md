---
"juniper": patch
---

With `openApi30`, an array schema without `items` now outputs `items: {}`, since OpenAPI 3.0 requires `items` whenever `type` is `array`. It accepts the same values as before.

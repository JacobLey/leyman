---
"juniper-validator": patch
---

Accept schemas with `.metadata()` keywords, which strict mode rejected as unknown. They're registered with Ajv as annotations. Unknown keywords in a rendered JSON Schema object are still rejected.

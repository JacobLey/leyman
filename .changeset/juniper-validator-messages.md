---
"juniper-validator": patch
---

With Ajv's `messages: false`, `validate()` returned no issues for an invalid value, as issues without a message were left out. Each now gets a message naming its keyword, like `must pass "type" keyword validation`.

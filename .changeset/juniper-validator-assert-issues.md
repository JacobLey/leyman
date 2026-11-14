---
"juniper-validator": patch
---

`assert` names what failed: its error message lists each issue `validate` returns, one per line as `<path>: <message>`, with the path as a JSON Pointer (`(root)` for the value itself). It was only `Value does not match schema`, with the details in `cause`, which still holds Ajv's error objects.

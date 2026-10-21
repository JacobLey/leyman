---
"juniper": patch
---

`juniper/top-level-schema` no longer reports schemas built in a function that's called immediately at module scope, like `const a = (() => objectSchema())();`, since it runs once.

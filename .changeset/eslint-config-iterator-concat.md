---
"@leyman/eslint-config": patch
---

`unicorn/prefer-iterator-concat` stays off on a Node.js 26 floor: TypeScript's lib doesn't declare `Iterator.concat` yet, so the call it asks for doesn't type-check.

---
"unknown-error": minor
---

On Node.js 22, which has no `Error.isError`, Errors are recognized by `instanceof Error` or their `[object Error]` tag, as in older browsers.

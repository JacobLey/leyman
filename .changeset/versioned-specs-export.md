---
"idempotency-keys": minor
"constant-consistent-hash": minor
---

Export `SPEC_VERSION`, the version of the language-independent specification the package implements (`'1.0'`). The specification is now versioned as `major.minor`: implementations that share a major version share keys (idempotency-keys) or buckets (constant-consistent-hash).

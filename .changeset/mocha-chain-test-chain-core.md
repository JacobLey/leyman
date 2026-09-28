---
"mocha-chain": patch
---

Move framework-agnostic internals to `test-chain-core` and remove `haywire` dependency.

Chained hooks that execute out of order now fail with `HookOrderError` rather than hanging or receiving an empty context, and hooks chained from a failed hook receive the context produced before the failure.

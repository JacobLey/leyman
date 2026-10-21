---
"test-chain-core": patch
---

When a hook runs before the hook it is chained from, hooks chained after it now also fail with `HookOrderError`, instead of waiting for its context until the framework times out.

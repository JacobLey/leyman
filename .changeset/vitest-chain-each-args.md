---
"vitest-chain": patch
---

`beforeEach` and `afterEach` callbacks are typed with the test context alone. They were typed with a second `suite` argument, copied from vitest's types, which vitest never passes.

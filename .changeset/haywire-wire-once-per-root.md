---
'haywire': patch
---

Stop `wire()` and `check()` taking exponential time when a binding reaches the same dependency by many routes, which could stall a container of a few dozen bindings at startup. Each binding is now walked once per root, and an output with no cycle below it is only checked once. What they compute and the errors they throw are unchanged. `check()` still walks every route through bindings that are part of a deferred cycle, since whether a cycle is safe depends on the chain that closes it.

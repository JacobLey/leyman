---
"nx-lifecycle": patch
---

Drop the `haywire` and `haywire-launcher` dependencies. The executor, CLI and plugin call their dependencies directly, with no behavior change.

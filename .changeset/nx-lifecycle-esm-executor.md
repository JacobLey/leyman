---
"nx-lifecycle": patch
---

Load the executor as ES modules directly, dropping the `common-proxy` and `nx-plugin-handler` dependencies. Accept `{ "target": ..., "projects": [...] }` entries in a stage's `dependsOn`, which the schema wrongly rejected.

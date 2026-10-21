---
"nx-lifecycle": patch
---

The executor now fails when a `project.json` target with an `executor` or `command` has the name of a lifecycle target, instead of replacing it with an empty lifecycle target. `nx.json` `targetDefaults` already failed the same way, and the plugin already reported it.

---
"nx-lifecycle": patch
---

The executor skips projects without a `project.json` (e.g. inferred from a `package.json` alone), like the plugin, instead of failing to read it. A `project.json` or `nx.json` that isn't valid JSON now fails with `Failed to parse <path>`, like one that doesn't match the schema.

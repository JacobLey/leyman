---
"haywire": patch
---

Keep `describe()` and `toMermaid()` in a stable order after a container factory's `bindInstance()`: an instance bound for an id the module depends on takes its placeholder's place, rather than moving to the end.

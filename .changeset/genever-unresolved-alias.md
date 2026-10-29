---
"genever": patch
---

A YAML alias with no anchor before it (`*b` with no `&b`, or one after it) is a `YAMLError` at the alias, with its line and column, rather than a `ReferenceError` from the `yaml` package with no location.

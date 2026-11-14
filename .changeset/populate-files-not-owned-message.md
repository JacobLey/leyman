---
"populate-files": patch
"load-populate-files": patch
---

Reword the `not-owned` ownership error so it fits both of its causes: `File <path> exists but is not marked as generated (not signed)` for a `signed` file, and `(not listed in the manifest)` for an unsigned file with a `manifest`. The CLI's `--force` help now covers files tracked by `--manifest` too.

---
"populate-files": minor
"load-populate-files": minor
---

Add a `manifest` option (`--manifest`): a run records every generated file in a `generated-signature` manifest, so edits to any file type (including JSON) are detected and not overwritten without `force`, and `clean` only removes files the manifest lists. Files can record `manifestInputs`. With `check` and `clean`, out-of-date and stale files are now reported in one error.

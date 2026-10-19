---
"populate-files": minor
"load-populate-files": minor
---

Add opt-in `signed: true` per file: content is signed with `generated-signature`, manual sections are kept when regenerating, and files that were edited outside manual sections (or never signed) are not overwritten unless `force` (`--force`) is set. `options` is now optional in the `PopulateFile`/`PopulateFiles` types, matching the docs.

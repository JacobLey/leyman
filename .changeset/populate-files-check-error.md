---
"populate-files": minor
---

With `check`, out-of-date files reject with a new `PopulateFilesCheckError` (extends `PopulateFilesError`), rather than a plain `Error`. The message is unchanged, and its `files` property lists each file and reason.

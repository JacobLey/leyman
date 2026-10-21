---
"populate-files": patch
---

`populateFiles` rejects with a `TypeError` when two entries resolve to the same `filePath`, instead of writing both in parallel.

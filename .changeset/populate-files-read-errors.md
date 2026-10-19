---
"populate-files": patch
---

An existing file that can't be read (e.g. `EACCES`, or a directory at the path) now fails with the read error, instead of being reported as `file-not-exist` and overwritten.

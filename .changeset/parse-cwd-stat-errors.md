---
"parse-cwd": patch
---

Only a path that doesn't exist (`ENOENT`, or `ENOTDIR` when part of it is a file) rejects with `Directory not found`, now with the `stat` error as its `cause`. Any other failure, such as permission denied, rejects with the original error instead of claiming the directory is missing.

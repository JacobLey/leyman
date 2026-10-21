---
"find-import": minor
---

A matching file that exists but fails to load (e.g. invalid JSON, or a module that throws) now rejects with `Failed to load <path>`, with the original error as its `cause`. It used to be skipped silently, so the search moved on to another directory and could return a different file. Only missing files are skipped.

---
"load-populate-files": patch
---

Recognize a missing JS file by its `ERR_MODULE_NOT_FOUND` code (with [`unknown-error`](https://www.npmjs.com/package/unknown-error)'s `hasCode`) instead of searching the error's text, which also matched any other error that mentioned it, and could throw on a thrown value whose `toString` throws.

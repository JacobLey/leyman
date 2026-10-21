---
"find-import": patch
---

Files in a directory whose path contains characters that mean something else in a URL, like `#` or `%`, are found. They used to be skipped as if missing. JSON files are now loaded with a native JSON import instead of `require`.

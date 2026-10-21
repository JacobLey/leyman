---
"entry-script": patch
---

`main()` runs when the entry script's path contains characters that mean something else in a URL, like `#` or `%`. It used to silently not run.

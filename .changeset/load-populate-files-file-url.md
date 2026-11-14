---
"load-populate-files": patch
---

Load the config file by its file URL, so an absolute Windows path (`C:\...`) or a path containing `#` or `%` loads instead of failing as "JS file not found".

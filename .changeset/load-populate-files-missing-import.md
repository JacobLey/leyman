---
"load-populate-files": patch
---

Only report "JS file not found" when the config file itself is missing. A config file that imports a missing module now fails with Node's own error, which names that module.

---
"@leyman/nx-plugin": patch
---

`check-package` is inferred for every package that isn't `private`, not only those with a `tsc` target, so a package of config files is checked too.

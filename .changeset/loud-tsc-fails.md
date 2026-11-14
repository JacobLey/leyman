---
"@leyman/check-package": patch
---

Throw a `CheckPackageTscError` when `tsc` can't be run (it isn't at the `--tsc` path, prints no version, crashes, or is killed) instead of reporting no declaration problems.

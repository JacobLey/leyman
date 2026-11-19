---
"@leyman/nx-plugin": minor
---

The test targets store their coverage with a placeholder for the workspace root, and `coverage-report` puts the current root back before checking it, so a test result restored from a cache built at another path (in CI, or another checkout) now reports the right coverage. Adds the `leyman-portable-coverage` bin that does this.

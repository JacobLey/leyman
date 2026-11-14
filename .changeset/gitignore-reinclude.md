---
"@leyman/check-package": patch
---

Follow Git when `.gitignore` files disagree: the deepest one with a matching rule decides, so a package's `.gitignore` can re-include (`!keep`) a path one above it ignores, and the published files check then reports it.

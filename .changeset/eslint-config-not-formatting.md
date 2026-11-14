---
"@leyman/eslint-config": minor
---

`curly` (in its `all` style), `no-unexpected-multiline` and `unicorn/template-indent` are on. eslint-config-prettier, which the config applies last, turned them off along with the formatting rules, though a formatter doesn't fight them, so `unicorn/template-indent`'s `{ indent: 4 }` never applied.

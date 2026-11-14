---
"@leyman/eslint-config": patch
---

`baseNamingConvention` drops a second public `typeProperty` entry allowing PascalCase, which never applied: the entry before it has the same selector and modifiers, and `@typescript-eslint/naming-convention` uses the first match. Type properties stay camelCase or snake_case, as they were.

---
"@leyman/eslint-config": patch
---

CommonJS files (`.cjs`, `.cts`) may use `require`, as the README says: `import-x/no-commonjs`, `sonarjs/no-require-or-define` and `n/prefer-process-get-builtin-module` no longer report it there.

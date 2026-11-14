---
"@leyman/eslint-config": patch
---

JavaScript files are linted without type information, wherever they are: a `.js` file outside the package root and outside `tsconfig.json` no longer fails to parse. Where a type-aware typescript-eslint rule is off for JavaScript, the core rule it replaces now takes its setting rather than a bare `'error'`: `require-await` stays off, and `prefer-destructuring` keeps `array: false` for assignments. `@typescript-eslint/explicit-function-return-type`, `explicit-module-boundary-types` and `explicit-member-accessibility`, which JavaScript can't satisfy, are off for it.

---
"@leyman/eslint-config": minor
---

`configGenerator` returns a promise, and only a package that depends on `react` loads and applies the React, React Hooks and JSX a11y plugins. A config that spreads the result needs `...(await configGenerator({ ... }))`. A package without React no longer loads about 2,200 modules on every lint, and `n/no-top-level-await` is off for `eslint.config.js`.

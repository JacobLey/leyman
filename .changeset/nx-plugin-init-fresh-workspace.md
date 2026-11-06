---
"@leyman/nx-plugin": minor
---

`init` sets up all an empty workspace needs for a first package to pass `verify`: `@typescript/native` for `tsc`, a root `tsconfig.json`, a `.gitignore`, pnpm's `allowBuilds` for `nx` and `@swc/core`, check-package's `esm-only` profile, and nx-lifecycle without warnings for targets no project has yet. The generators take `@nx/*` plugins at the version of `nx`, and read ranges from the root `package.json` too.

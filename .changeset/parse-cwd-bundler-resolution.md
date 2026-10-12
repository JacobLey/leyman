---
"parse-cwd": patch
---

Resolve with TypeScript's `bundler` module resolution. The package was only exported under the `node` condition, which `bundler` resolution doesn't use, so `import { parseCwd } from 'parse-cwd'` failed to type-check there.

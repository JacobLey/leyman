---
"@leyman/nx-plugin": minor
---

The `package` generator's `floor` option is now a Node.js version (`<major>.<minor>.<patch>`), written to `engines.node` as `>=<floor>`, and defaults to 22.12.0 instead of the major 22. `>=22` claimed Node.js 22.0.0, which can't `require()` the package's ES modules and where its tests can't run: 22.12.0 is the oldest version mocha and vitest start on. The major still picks the `node-<major>` catalog for `@types/node` and the support floor's tsconfig.

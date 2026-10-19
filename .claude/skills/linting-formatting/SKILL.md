---
name: linting-formatting
description: Linting and formatting (ESLint, Biome, auto-fix)
---

# Linting and Formatting

> Configs: [`../../../nx.json`](../../../nx.json) (targets: `eslint`, `biome`) · [`../../../biome.json`](../../../biome.json) · [`@leyman/eslint-config`](../../../leyman/eslint-config/)

ESLint does all linting. Biome does formatting only (its linter is disabled). Both are required to pass CI.

## Running

```bash
nx run <project>:check            # format (writes), then eslint
nx run-many -t check -c fix       # also auto-fix lint

# A single tool on one project (work targets are `eslint` and `biome`;
# `check:lint` / `prepare:format` are the orchestration targets that wrap them)
nx run <project>:eslint -c fix --excludeTaskDependencies
nx run <project>:biome --excludeTaskDependencies
```

Formatting is part of the `prepare` stage, which runs before both `check` and `build`. It writes changes by default, and in CI (`CI` set) it only checks and fails on unformatted code. `-c check` checks without writing locally.

Linting is the `check` stage, which `build` and `test` don't depend on, so lint errors never block a quick build or test run. `verify` (and `test-ci`) runs both. Code changed by `eslint -c fix` is reformatted on the next run.

Biome is not cached by Nx (it is fast enough), ESLint is.

## ESLint config

Every package's `eslint.config.js` calls the shared generator, which derives rules from the package's `package.json`:

```js
import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };
export default configGenerator({ configUrl: import.meta.url, packageJson });
```

Rules are adopted liberally (often every rule a plugin offers) and then disabled where they don't fit. If a rule is wrong for this repo, change it in `@leyman/eslint-config` for every package rather than overriding it locally. Test files (`test/**`) have a relaxed rule set.

The `eslint` target runs from the workspace root. ESLint looks up the config from each file, so each file uses its package's config, with patterns relative to the package. Running from the root lets `eslint-plugin-sonarjs` find `pnpm-workspace.yaml` and resolve `catalog:` versions, which it only looks for up to ESLint's working directory. Running `eslint .` inside a package still works, but prints `could not be resolved for catalog` for each catalog dependency.

## Custom rules

Rules ship with the package whose code they are about, as an ESLint plugin on a `./eslint` entry point (e.g. `generated-signature/eslint`), not as separate `eslint-plugin-*` packages. A rule about no particular package goes in a standalone package that follows the same pattern, with the plugin as its main entry point.

### Writing a plugin

- Put the plugin under `src/eslint/` (entry `src/eslint/plugin.ts`, rules in `src/eslint/rules/`), exported as `"./eslint": "./dist/eslint/plugin.js"`. Files under any `eslint/` directory may name object methods in PascalCase, for AST visitors like `Program`.
- The main entry point must never import from `src/eslint/`. Import `eslint` for types only (`import type`), and declare it as an optional peer (`peerDependencies` + `peerDependenciesMeta.optional`) plus a devDependency. [`e2e/published-entrypoints`](../../../e2e/published-entrypoints/test/integration/eslint-entrypoints.spec.ts) checks all of this for every package with an `./eslint` export.
- The plugin has `meta.namespace` and a flat `configs.recommended` that turns on its rules and registers the plugin itself (`recommended.plugins = { [namespace]: plugin }`), so consumers can use it on its own. See [`generated-signature`'s plugin](../../../tools/generated-signature/generated-signature/src/eslint/plugin.ts).
- Each rule has `meta.docs.url` pointing at a `### \`<namespace>/<rule>\`` section of the package README, with a wrong and a right example.
- Prefer AST and import tracking over type information. Autofix only when the fix is always safe; no fix at all where it would just approve the problem.
- Test with ESLint's `RuleTester`, driven by `mocha-chain` (`RuleTester.describe = suite; RuleTester.it = test; RuleTester.itOnly = test.only;`), asserting `messageId`s rather than message text. Also test that `configs.recommended` works on its own with `new Linter().verify(...)`.

### Turning a plugin on in a project

Pass the plugin to `configGenerator`, which turns on its `configs.recommended` rules for the package's source files. The project must depend on the package providing it:

```js
import configGenerator from '@leyman/eslint-config';
import generatedSignature from 'generated-signature/eslint';
import packageJson from './package.json' with { type: 'json' };

export default configGenerator({
    packageJson,
    plugins: [generatedSignature],
    configUrl: import.meta.url,
});
```

`@leyman/eslint-config` never imports a package's plugin itself: every package devDepends on it, so that would be a circular dependency. Nx builds the plugin's package before linting (its `dist` is an input of `eslint`), so rule changes apply to dependents without publishing. A package isn't linted by its own plugin.

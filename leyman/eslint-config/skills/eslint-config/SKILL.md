---
name: eslint-config
description: Linting a package with @leyman/eslint-config (the configGenerator options, what each directory is held to, eslint-disable comments, and turning on a package's own ESLint plugin)
---

# @leyman/eslint-config

Each package's `eslint.config.js` calls the shared generator, which derives its rules from the package's `package.json`. Reference: the package's [README](https://github.com/JacobLey/leyman/blob/main/leyman/eslint-config/README.md).

```js
import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default configGenerator({ configUrl: import.meta.url, packageJson });
```

## Options

- `node: true` for a package whose code only runs on Node.js. Without it only the globals Node.js shares with browsers are defined (`fetch`, `URL`, `console`...), so code meant to run elsewhere can't use `process` or `Buffer` by accident. Tests always have them. Other globals, such as the DOM's, go in the package's own `languageOptions.globals`.
- `plugins`: ESLint plugins shipped by the workspace's own packages, each with `meta.namespace` and a flat `configs.recommended`, turned on for source files outside `test/`. The package must depend on the one providing each.
- `engines.node` in `package.json` is the package's floor: rules suggesting an API newer than it are off. Dependencies with a `workspace:` version count as internal imports.

## What each directory is held to

- `src/`: importing a `devDependency` is an error. `src/cli.ts` and `src/commands/**` may use `console`.
- `test/`: Node.js globals, and the rules that get in the way of tests (magic numbers, return types, `@ts-expect-error`...) are off.
- `**/eslint/**`: plugin code may name visitors after AST nodes (`Program`) and use kebab-case rule names.
- `coverage`, `dist`, `dist-test`, `out` and `node_modules` aren't linted.

## Disabling a rule

- Fix what the rule found first: a disable often hides a simpler way to write it.
- Every `eslint-disable` comment gives its reason after `--`, and one that no longer suppresses anything is an error.
- When a rule clashes with what a whole package does, not one line, turn it off in that package's `eslint.config.js`, with a comment saying why.
- The rules are adopted liberally, often every rule a plugin offers. A rule that is wrong everywhere belongs fixed in `@leyman/eslint-config`, not disabled package by package.

## Running

Run ESLint from the workspace root: ESLint finds each file's config, with patterns relative to its package, and `eslint-plugin-sonarjs` only finds `pnpm-workspace.yaml` (to resolve `catalog:` versions) up to ESLint's working directory. Run inside a package it still works, but warns `could not be resolved for catalog` for each catalog dependency. `--fix` applies the safe fixes; format afterwards.

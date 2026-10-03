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

Rules are adopted liberally (often every rule a plugin offers) and then disabled where they don't fit. If a rule is wrong for this repo, change it in `@leyman/eslint-config` for every package rather than overriding it locally. Test files (`src/tests/**`) have a relaxed rule set.

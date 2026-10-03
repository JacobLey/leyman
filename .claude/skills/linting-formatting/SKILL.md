---
name: linting-formatting
description: Linting and formatting (ESLint, Biome, auto-fix)
---

# Linting and Formatting

> Configs: [`../../../nx.json`](../../../nx.json) (targets: `eslint`, `biome`) · [`../../../biome.json`](../../../biome.json) · [`@leyman/eslint-config`](../../../leyman/eslint-config/)

ESLint does all linting. Biome does formatting only (its linter is disabled). Both are required to pass CI.

## Running

```bash
nx run <project>:check            # eslint, then biome
nx run-many -t check -c fix       # auto-fix everything

# A single tool on one project (work targets are `eslint` and `biome`;
# `check:lint` / `check:format` are the orchestration targets that wrap them)
nx run <project>:eslint -c fix --excludeTaskDependencies
nx run <project>:biome -c fix --excludeTaskDependencies
```

Biome runs after ESLint on purpose: ESLint fixes can produce code that then needs reformatting.

Both targets also have a `no-check` configuration that turns them into no-ops. `test-only` uses it to skip linting while iterating.

Biome is not cached by Nx (it is fast enough), ESLint is.

## ESLint config

Every package's `eslint.config.js` calls the shared generator, which derives rules from the package's `package.json`:

```js
import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };
export default configGenerator({ configUrl: import.meta.url, packageJson });
```

Rules are adopted liberally (often every rule a plugin offers) and then disabled where they don't fit. If a rule is wrong for this repo, change it in `@leyman/eslint-config` for every package rather than overriding it locally. Test files (`src/tests/**`) have a relaxed rule set.

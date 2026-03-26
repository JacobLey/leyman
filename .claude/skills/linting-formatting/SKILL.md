---
name: linting-formatting
description: Linting and formatting (ESLint, Biome, auto-fix)
---

# Linting and Formatting

> Tool docs: [ESLint](https://eslint.org/docs/latest/) · [Biome](https://biomejs.dev/reference/cli/)
> Configs: [`../../../nx.json`](../../../nx.json) (targets: `eslint`, `biome`) · [`../../../biome.json`](../../../biome.json)

## Running Checks

```bash
# Full lint + format check (both ESLint and Biome)
nx run <project>:check

# All projects
nx run-many -t check

# Only lint a single project
nx run <project>:check:eslint --excludeTaskDependencies

# Format only (Biome)
nx run <project>:check:biome --excludeTaskDependencies
```

## Auto-fixing

```bash
# Fix lint and format issues
nx run <project>:check --configuration=fix

# Fix all projects
nx run-many -t check -c fix

# Fix only lint for a single project
nx run <project>:check:eslint -c fix --excludeTaskDependencies

# Fix only format for a single project
nx run <project>:check:biome -c fix --excludeTaskDependencies
```

## ESLint

Every package has an `eslint.config.js` that extends the shared workspace config:

```js
// eslint.config.js (in each package)
import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };
export default configGenerator({ configUrl: import.meta.url, packageJson });
```

The `@leyman/eslint-config` package dynamically generates rules based on the package's `package.json`. It enables many plugins including:
- `@typescript-eslint` — TypeScript-specific rules
- `eslint-plugin-unicorn` — best practices
- `eslint-plugin-sonarjs` — code quality
- `eslint-plugin-import` — import ordering and correctness
- `eslint-plugin-n` — Node.js-specific rules

This config can be extended (via Eslint's [Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files)) but that is unusual. If a rule really needs to be tweaked, it is usually best to fix it for all packages at once in the main config.

## Biome

Biome handles **formatting only** (linting is disabled in biome.json - ESLint handles all linting).

**Key formatting rules** (`biome.json`):
- Line width: 100 characters
- Indent: 4 spaces
- Quotes: single for JS/TS, double for JSX
- Semicolons: always
- Trailing commas: ES5 style
- JSON: 2-space indent, one item per line

Biome is **not cached** in Nx (runs every time). It is fast enough that caching isn't needed.

## What Each Tool Covers

| Tool | Scope |
|------|-------|
| ESLint | TypeScript logic, imports, code quality |
| Biome | Formatting (whitespace, quotes, commas, line length) for `.ts`, `.js`, `.json` |

## CI Behavior

Linting and formatting are required for passing CI.

## Fixing Specific Issues

**ESLint rule violation** — Read the rule documentation linked in the error, or run with `--configuration=fix` if the rule is auto-fixable.

Eslint rules generally are adopted liberally (often using _all_ rules avaiable) and then disabling/tweaking the ones that don't make sense. Rules may be updated in the main config if the goals do not align with this repo's best practices.

**Biome formatting** — Always auto-fixable, so long as the code is valid: `nx run <project>:biome --configuration=fix`.

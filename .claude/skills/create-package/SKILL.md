---
name: create-package
description: Creating a new package in the monorepo
---

# Creating a New Package

> Reference: https://nx.dev/concepts/more-concepts/applications-and-libraries

This workspace uses manual package creation (no Nx generators are configured for new packages). Use an existing package as a template.

## Steps

### 1. Choose a template

Pick an existing package at a similar level of complexity:

```bash
# Simple library → tools/enum-to-array or tools/parse-cwd
# Library with DI → tools/haywire
# App → apps/barrelify
```

### 2. Create the package directory and files

Required files (copy and adapt from template):

| File | Purpose |
|------|---------|
| `package.json` | Name, version, dependencies. Must have `"type": "module"`. New packages should start at `0.0.1` version |
| `tsconfig.json` | Extends root tsconfig. Dependencies will be synced automatically. Body should be `{"extends": "./path/to/tsconfig.build.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo" } }` |
| `project.json` | Declares non-default targets. Most targets come from `nx.json` defaults. Many tasks are synced via [lifecycle](../../../leyman/main/lifecycle.json) and the rest are opted into based on demands. See [the nx-tasks-reference skill](../nx-tasks-reference/SKILL.md) for more info about which tasks to opt into. |
| `eslint.config.js` | By default just export the result from `configGenerator` from `@leyman/eslint-config` combined with package.json. Can be extended if package has specific requirements. |

### 3. Run initial nx command

Run `pnpm i` then `nx run-many -t build` and `nx run @leyman/main:lifecycle`

This will generate `pnpm-dedicated-lockfile`, and generally make
sure all the config files (e.g. `tsconfig.json`) are properly synced.
```

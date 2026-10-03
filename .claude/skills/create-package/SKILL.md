---
name: create-package
description: Creating a new package in the monorepo
---

# Creating a New Package

There are no generators. Copy an existing package of similar shape and adapt it:

- Simple library: `tools/parse-cwd`, `tools/enum-to-array`
- Library with DI: `tools/haywire`
- CLI app: `apps/barrelify`

Put it under `tools/` or `apps/` (see the [projects skill](../projects/SKILL.md)).

## Files

| File | Notes |
|------|-------|
| `package.json` | `"type": "module"`, version `0.0.1`. Dependencies via `catalog:` / `workspace:^` (see [install-package](../install-package/SKILL.md)). Tests need dev deps on `mocha`, `mocha-chain`, `@leyman/expect`, `c8`. |
| `tsconfig.json` | `{ "extends": "<relative>/tsconfig.build.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo" } }`. `references` are generated. |
| `project.json` | List only the work targets the package uses, as `{}` (see [nx-tasks-reference](../nx-tasks-reference/SKILL.md)). Orchestration targets are added by the lifecycle command. |
| `eslint.config.js` | Export `configGenerator(...)` from `@leyman/eslint-config` (see [linting-formatting](../linting-formatting/SKILL.md)). |
| `README.md` | Required. See [writing-readmes](../writing-readmes/SKILL.md). |

## Then

```bash
pnpm i
nx run @leyman/main:lifecycle   # adds orchestration targets to project.json
nx run-many -t build            # syncs tsconfig references
```

Also add a row to the table in the [projects skill](../projects/SKILL.md), and a changeset if the package will be published (see [versioning](../versioning/SKILL.md)).

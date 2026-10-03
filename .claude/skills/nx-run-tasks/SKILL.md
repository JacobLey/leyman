---
name: nx-run-tasks
description: Running Nx tasks (build, test, check, etc.)
---

# Running Nx Tasks

```bash
nx run <project>:<target>
nx run-many -t <target> [-p <project1> <project2>]
nx affected -t <target>        # vs main
```

Run the high-level target you care about (`check`, `build`, `test`). Its dependencies run first and are usually cache hits. See the [lifecycle skill](../../../leyman/main/.claude/skills/lifecycle/SKILL.md) for the ordering.

`--excludeTaskDependencies` rarely does what you want. Tests run from `dist/`, so skipping the build means testing stale code.

## Configurations

- `-c fix`: auto-fix lint and format (`eslint`, `biome`).
- `-c no-check`: turn `eslint`/`biome` into no-ops so build/test skip them.

## Shortcuts (`scripts/commands`, on `PATH`)

| Command | Runs |
|---------|------|
| `test-only` | `test` with `-c no-check --nxBail`: fastest feedback |
| `test-and-fix` | `test` with `-c fix` |
| `test-ci` | `test`, then `coverage-report`: what CI runs |
| `dagger-test` | The full CI pipeline in a container (see [dagger-ci](../dagger-ci/SKILL.md)) |

## Finding targets

`nx show project <project>` lists the resolved targets, including ones inferred by plugins (e.g. `typecheck`). Work targets are described in [nx-tasks-reference](../nx-tasks-reference/SKILL.md).

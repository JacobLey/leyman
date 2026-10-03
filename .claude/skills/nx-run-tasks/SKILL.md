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

Run the high-level target you care about (`build`, `test`, `check`, `verify`). Its dependencies run first and are usually cache hits. See the [lifecycle skill](../../../leyman/main/.claude/skills/lifecycle/SKILL.md) for the ordering.

`test` only tests the project itself. To test everything, use `nx run-many -t test` or `nx affected -t test`.

`--excludeTaskDependencies` rarely does what you want. Tests run from `dist/`, so skipping the build means testing stale code.

## Configurations

- `-c fix`: auto-fix lint (`eslint`). Formatting (`biome`) always writes outside CI; `-c check` makes it check only.

## Shortcuts (`scripts/commands`, on `PATH`)

| Command | Runs |
|---------|------|
| `test-only` | `test` with `--nxBail`: build + test, no lint. Fastest feedback |
| `test-and-fix` | `verify` with `-c fix` |
| `test-ci` | `verify` (lint + test, including `coverage-report`): what CI runs |
| `dagger-test` | The full CI pipeline in a container (see [dagger-ci](../dagger-ci/SKILL.md)) |

## Finding targets

`nx show project <project>` lists the resolved targets, including ones inferred by plugins (e.g. `typecheck`). Work targets are described in [nx-tasks-reference](../nx-tasks-reference/SKILL.md).

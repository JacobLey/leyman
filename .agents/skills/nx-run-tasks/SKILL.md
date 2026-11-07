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

Run the high-level target you care about (`build`, `test`, `check`, `verify`). Its dependencies run first and are usually cache hits. With everything cached, `nx run-many -t verify` takes about 40s and `nx run <project>:verify` about 3s, on 14 cores. Most of what remains is Nx hashing the outputs of dependencies: the uncached tasks, such as `biome` and `sync-injected`, take about 50ms each. See the [lifecycle skill](../../../leyman/main/.agents/skills/lifecycle/SKILL.md) for the ordering.

`test` only tests the project itself. To test everything, use `nx run-many -t test` or `nx affected -t test`.

`--excludeTaskDependencies` rarely does what you want. Tests run from `dist/`, so skipping the build means testing stale code. It also misses the cache, and fills it with entries nothing reuses: without the dependencies in the graph, every target hashing their outputs (`dependentTasksOutputFiles`) gets a different hash.

Nx finds plugins like `@naxodev/gonx` through `.nx/installation`, a link to `leyman/main`, which is how they load with nothing in the root `package.json`.

## Configurations

- `-c fix`: auto-fix lint (`eslint`). Formatting (`biome`) always writes outside CI; `-c check` makes it check only.

## Shortcuts (`scripts/commands`, on `PATH`)

| Command | Runs |
|---------|------|
| `test-only` | `test` with `--nxBail`: build + test, no lint. Fastest feedback |
| `test-and-fix` | `verify` with `-c fix` |
| `test-ci` | `verify` (lint + test, including `coverage-report`): what CI runs |
| `serve [project]` | `dev` with plain output (no task view), at `https://<worktree>.<repo>.localhost`. Without a project, the only one with a `dev` target |
| `dagger-test` | The full CI pipeline in a container (see [dagger-ci](../dagger-ci/SKILL.md)) |

## Finding targets

`nx show project <project>` lists the resolved targets, including ones inferred by plugins (e.g. `go-build`). Work targets are described in [nx-tasks-reference](../nx-tasks-reference/SKILL.md).

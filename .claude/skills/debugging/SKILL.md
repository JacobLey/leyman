---
name: debugging
description: Debugging (source maps, cache, test failures)
---

# Debugging

## Source maps

Compiled output has source maps. Run with `NODE_OPTIONS=--enable-source-maps` to get TypeScript stack traces. The `mocha-unit-test`, `mocha-integration-test` and `vitest-unit-test` targets already set it.

## Running a single test file

Tests run from compiled `dist/`, so rebuild first (`nx run <project>:build`). Then, from the project directory (mocha is a per-project dev dependency, not on `PATH`):

```bash
NODE_OPTIONS=--enable-source-maps ./node_modules/.bin/mocha './dist/tests/unit/my.spec.js' --grep "my test name"
```

## Stale results

```bash
nx run <project>:<target> --skipNxCache   # bypass local and shared (remote) cache
nx reset                                  # clear this worktree's .nx/ cache and daemon
```

Task outputs are also shared between worktrees through the `nx-cache` sidecar. `nx reset` does not clear that; see the [worktrees skill](../worktrees/SKILL.md).

## Inspecting targets

Some targets (e.g. `typecheck`) are inferred by the `@nx/js/typescript` plugin and never appear in `project.json`. Use the resolved config:

```bash
nx show project <project> --json | jq '.targets.<target>'
nx show target inputs <project>:<target>   # what is hashed for caching
```

## Coverage

HTML reports are written to `.coverage/project/<name>/report/index.html`. Only the project's own tests count toward its coverage (see `scripts/nx/coverage-report.sh`).

## Command not found

`nx`, `biome`, `eslint` (from `leyman/main/node_modules/.bin`) and `scripts/commands` are added to `PATH` by `remoteEnv` in `.devcontainer/devcontainer.json`, so they are only on `PATH` inside the devcontainer. In another worktree, that `PATH` still points at the worktree the container was opened on.

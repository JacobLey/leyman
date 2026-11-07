---
name: lifecycle
description: How the install → prepare → check/build → test → verify task lifecycle is wired (nx-lifecycle, lifecycle.json) and how to add a new target to it
---

# Lifecycle Configuration

How stages, hooks and bindings work in general, and the rules for any workspace using `nx-lifecycle`: the `nx-lifecycle` skill ([`.agents/skills/nx-lifecycle`](../../../../../.agents/skills/nx-lifecycle/SKILL.md), which `nx-lifecycle` ships: `link-skills` links it here, pnpm in a repository that installs it). This one is this repository's stages, and how it differs.

[`lifecycle.json`](../../../lifecycle.json) is the source of truth for task ordering. [`nx-lifecycle`](../../../../../apps/nx-lifecycle/README.md) uses it to generate every orchestration target's `dependsOn` in `nx.json` and each `project.json`. For why, see [WHY-NX-LIFECYCLE.md](../../../../../apps/nx-lifecycle/WHY-NX-LIFECYCLE.md).

`nx-lifecycle` also ships an Nx plugin that infers these targets instead of generating them, which is what other workspaces should use. This repo keeps the executor: Nx needs plugins before it can build anything, so the plugin would have to come from a published version. Generated files keep working if `nx-lifecycle` breaks, and `verify` runs the local build against this repo, so a mistake shows up in the same commit.

## Stages

```
install → prepare ┬→ check ─────────┬→ verify
                  └→ build → test ──┘
```

| Stage     | Hooks                        | Purpose                                                                                                                                                                                                                                                                                                                                     |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install` | —                            | Dependencies installed and linked                                                                                                                                                                                                                                                                                                           |
| `prepare` | `generate` → `format`        | Everything that rewrites source: codegen (`barrelify`, `update-ts-references`, `schema-snapshot`), then formatting (`biome`, `gofmt`). Writes locally, only checks in CI, so `build` always sees final source                                                                                                                               |
| `check`   | `lint`                       | Opinionated rules and package checks (`eslint`, `check-package`, `go-lint`, `drizzle-kit-check`). Runs after the project's own build (tests import its `dist/` types). Nothing depends on it, so a hacky change still builds and tests                                                                                                      |
| `build`   | `run` → `post` → `sync`      | `run`: produce `dist/` (clearing it first). `post`: codegen that needs `dist/` (`populate-files` → `out/`). `sync`: copy the published files into dependents' injected copies (`sync-injected`), uncached so it also follows cache restores                                                                                                 |
| `test`    | `compile` → `run` → `report` | `compile`: compile and type-check `test/` into `dist-test/` (`tsc-test`). `run`: test suites, each clearing its own coverage data (unit and integration can both run), and `go-test`. `report`: enforce coverage thresholds (`coverage-report`, `go-coverage-report`). Does not test dependencies; use `nx run-many`/`nx affected` for that |
| `verify`  | —                            | `check` + `test`: everything CI requires of a project                                                                                                                                                                                                                                                                                       |

`prepare` targets must write by default and only check (failing on drift) when `CI` is set. Formatting before `build` keeps its cache inputs stable.

What each work target does: [nx-tasks-reference](../../../../../.agents/skills/nx-tasks-reference/SKILL.md).

## Adding a work target

1. Add it to `targetDefaults` in `nx.json`.
2. Bind it to a stage hook in `lifecycle.json`.
3. Run `nx run @leyman/main:lifecycle` to regenerate `dependsOn`.
4. Add it as `{}` to the `project.json` of every project that uses it (this is not automatic).
5. Document it in [nx-tasks-reference](../../../../../.agents/skills/nx-tasks-reference/SKILL.md).

Don't hand-edit orchestration `dependsOn`. If a target needs to run before another, express that with stages/hooks (adding a hook if needed).

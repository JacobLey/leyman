---
name: lifecycle
description: How the install → prepare → check/build → test → verify task lifecycle is wired (nx-lifecycle, lifecycle.json) and how to add a new target to it
---

# Lifecycle Configuration

[`lifecycle.json`](../../../lifecycle.json) is the source of truth for task ordering. [`nx-lifecycle`](../../../../../apps/nx-lifecycle/README.md) uses it to generate every orchestration target's `dependsOn` in `nx.json` and each `project.json`. For why, see [WHY-NX-LIFECYCLE.md](../../../../../apps/nx-lifecycle/WHY-NX-LIFECYCLE.md).

## Stages

```
install → prepare ┬→ check ─────────┬→ verify
                  └→ build → test ──┘
```

| Stage | Hooks | Purpose |
|-------|-------|---------|
| `install` | — | Dependencies installed and linked |
| `prepare` | `generate` → `format` | Everything that rewrites source: codegen (`barrelify`, `update-ts-references`), then formatting (`biome`). Writes locally, only checks in CI, so `build` always sees final source |
| `check` | `lint` | Opinionated rules (`eslint`). Nothing else depends on it, so a hacky change still builds and tests |
| `build` | `run` → `post` | `run`: produce `dist/` (clearing it first). `post`: codegen that needs `dist/` (`populate-files` → `out/`) |
| `test` | `run` → `report` | `run`: test suites, each clearing its own coverage data (unit and integration can both run). `report`: enforce coverage thresholds. Does not test dependencies; use `nx run-many`/`nx affected` for that |
| `verify` | — | `check` + `test`: everything CI requires of a project |

`prepare` targets must write by default and only check (failing on drift) when `CI` is set. Formatting before `build` keeps its cache inputs stable.

What each work target does: [nx-tasks-reference](../../../../../.claude/skills/nx-tasks-reference/SKILL.md).

## Adding a work target

1. Add it to `targetDefaults` in `nx.json`.
2. Bind it to a stage hook in `lifecycle.json`.
3. Run `nx run @leyman/main:lifecycle` to regenerate `dependsOn`.
4. Add it as `{}` to the `project.json` of every project that uses it (this is not automatic).
5. Document it in [nx-tasks-reference](../../../../../.claude/skills/nx-tasks-reference/SKILL.md).

Don't hand-edit orchestration `dependsOn`. If a target needs to run before another, express that with stages/hooks (adding a hook if needed).

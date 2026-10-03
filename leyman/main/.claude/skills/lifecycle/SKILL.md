---
name: lifecycle
description: How the check → build → test → install task lifecycle is wired (nx-lifecycle, lifecycle.json) and how to add a new target to it
---

# Lifecycle Configuration

[`lifecycle.json`](../../../lifecycle.json) is the source of truth for task ordering. [`nx-lifecycle`](../../../../../apps/nx-lifecycle/README.md) uses it to generate every orchestration target's `dependsOn` in `nx.json` and each `project.json`. For why, see [WHY-NX-LIFECYCLE.md](../../../../../apps/nx-lifecycle/WHY-NX-LIFECYCLE.md).

## Stages

| Stage | Hooks | Purpose |
|-------|-------|---------|
| `install` | — | Dependencies installed and linked |
| `check` | `lint` → `format` | Linters, then formatters (formatting runs last so lint fixes get reformatted) |
| `build` | `pre` → `run` → `post` | `pre`: edit source or reset output (`barrelify`, `delete-dist`). `run`: produce `dist/`. `post`: codegen that needs `dist/` (`populate-files` → `out/`) |
| `test` | `reset` → `run` | `reset`: clear previous coverage. `run`: test suites (unit and integration can both run) |

Work targets should support a `no-check` configuration where it makes sense, so `build`/`test` can run without strict lint (`test-only` relies on this).

What each work target does: [nx-tasks-reference](../../../../../.claude/skills/nx-tasks-reference/SKILL.md).

## Adding a work target

1. Add it to `targetDefaults` in `nx.json`.
2. Bind it to a stage hook in `lifecycle.json`.
3. Run `nx run @leyman/main:lifecycle` to regenerate `dependsOn`.
4. Add it as `{}` to the `project.json` of every project that uses it (this is not automatic).
5. Document it in [nx-tasks-reference](../../../../../.claude/skills/nx-tasks-reference/SKILL.md).

Don't hand-edit orchestration `dependsOn`. If a target needs to run before another, express that with stages/hooks (adding a hook if needed).

## `coverage-report` is outside the lifecycle

It is deliberately not bound to `test`, so `nx run-many -t test` stays fast during development. `test-ci` runs `test` and then `coverage-report` as a separate pass, and that is what CI enforces.

# Agent Guide

This is an Nx-managed PNPM monorepo. See [nx.dev](https://nx.dev) for general Nx documentation.

All agent-focused documentation should use SKILL.md, but this file is linked to CLAUDE.md for initial discoverability.

## Nx in This Repo

Nx is **not globally installed**. It ships as a dependency of `@leyman/main` and is on `PATH` via `/workspace/leyman/main/node_modules/.bin`. **Use `nx` directly — no `npx`, no `pnpm exec`.**

The workspace task lifecycle (check → build → test → install phases and their sub-targets) is defined in [`nx.json`](./nx.json) — that is the source of truth for how tasks are ordered and what they do.

## Skills

Focused guides for common workflows in this repo:

### Workspace Navigation

| Task | Skill |
|------|-------|
| Running Nx tasks (build, test, check, etc.) | [`.claude/skills/nx-run-tasks/SKILL.md`](./.claude/skills/nx-run-tasks/SKILL.md) |
| Understanding the various projects/packages available | [`.claude/skills/projects/SKILL.md`](./.claude/skills/projects/SKILL.md) |
| Creating a new package in the monorepo | [`.claude/skills/create-package/SKILL.md`](./.claude/skills/create-package/SKILL.md) |
| Installing a package dependency | [`.claude/skills/install-package/SKILL.md`](./.claude/skills/install-package/SKILL.md) |
| What each `nx.json` target does and when to add it to `project.json` | [`.claude/skills/nx-tasks-reference/SKILL.md`](./.claude/skills/nx-tasks-reference/SKILL.md) |
| Task lifecycle wiring (how check → build → test connect) | [`leyman/main/.claude/lifecycle/SKILL.md`](./leyman/main/.claude/lifecycle/SKILL.md) |
| DevContainer runtimes, CLI tools, and version parity with Dagger | [`.claude/skills/devcontainer/SKILL.md`](./.claude/skills/devcontainer/SKILL.md) |
| Writing and maintaining package READMEs | [`.claude/skills/writing-readmes/SKILL.md`](./.claude/skills/writing-readmes/SKILL.md) |

### Coding Standards

| Topic | Skill |
|-------|-------|
| Coding patterns and conventions (package design, types, DI, docs) | [`.claude/skills/coding-patterns/SKILL.md`](./.claude/skills/coding-patterns/SKILL.md) |

### Development Workflows

| Task | Skill |
|------|-------|
| Writing and running tests (Mocha, mocha-chain, Sinon, C8) | [`.claude/skills/testing/SKILL.md`](./.claude/skills/testing/SKILL.md) |
| Building TypeScript packages (SWC, tsconfig, ESM) | [`.claude/skills/typescript/SKILL.md`](./.claude/skills/typescript/SKILL.md) |
| Linting and formatting (ESLint, Biome, auto-fix) | [`.claude/skills/linting-formatting/SKILL.md`](./.claude/skills/linting-formatting/SKILL.md) |
| Running CI locally with Dagger | [`.claude/skills/dagger-ci/SKILL.md`](./.claude/skills/dagger-ci/SKILL.md) |
| Versioning packages with changesets | [`.claude/skills/versioning/SKILL.md`](./.claude/skills/versioning/SKILL.md) |
| Updating catalog dependencies to latest minor/patch versions | [`.claude/skills/updating-dependencies/SKILL.md`](./.claude/skills/updating-dependencies/SKILL.md) |
| Debugging (source maps, cache, test failures) | [`.claude/skills/debugging/SKILL.md`](./.claude/skills/debugging/SKILL.md) |


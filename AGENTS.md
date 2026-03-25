# Agent Guide

This is an Nx-managed PNPM monorepo. See [nx.dev](https://nx.dev) for general Nx documentation.

All agent-focused documentation should use AGENTS.md, but this file is linked to CLAUDE.md for initial discoverability.

## Nx in This Repo

Nx is **not globally installed**. It ships as a dependency of `@leyman/main` and is on `PATH` via `/workspace/leyman/main/node_modules/.bin`. **Use `nx` directly — no `npx`, no `pnpm exec`.**

The workspace task lifecycle (check → build → test → install phases and their sub-targets) is defined in [`nx.json`](./nx.json) — that is the source of truth for how tasks are ordered and what they do.

## Skills

Focused guides for common workflows in this repo:

### Workspace Navigation

| Task | Skill |
|------|-------|
| Running Nx tasks (build, test, check, etc.) | [`skills/nx-run-tasks/AGENTS.md`](./skills/nx-run-tasks/AGENTS.md) |
| Understanding the various projects/packages available | [`skills/projects/AGENTS.md`](./skills/projects/AGENTS.md) |
| Creating a new package in the monorepo | [`skills/create-package/AGENTS.md`](./skills/create-package/AGENTS.md) |
| Installing a package dependency | [`skills/install-package/AGENTS.md`](./skills/install-package/AGENTS.md) |
| What each `nx.json` target does and when to add it to `project.json` | [`skills/nx-tasks-reference/AGENTS.md`](./skills/nx-tasks-reference/AGENTS.md) |
| Task lifecycle wiring (how check → build → test connect) | [`leyman/main/lifecycle/AGENTS.md`](./leyman/main/lifecycle/AGENTS.md) |
| DevContainer runtimes, CLI tools, and version parity with Dagger | [`skills/devcontainer/AGENTS.md`](./skills/devcontainer/AGENTS.md) |
| Writing and maintaining package READMEs | [`skills/writing-readmes/AGENTS.md`](./skills/writing-readmes/AGENTS.md) |

### Coding Standards

| Topic | Skill |
|-------|-------|
| Coding patterns and conventions (package design, types, DI, docs) | [`skills/coding-patterns/AGENTS.md`](./skills/coding-patterns/AGENTS.md) |

### Development Workflows

| Task | Skill |
|------|-------|
| Writing and running tests (Mocha, mocha-chain, Sinon, C8) | [`skills/testing/AGENTS.md`](./skills/testing/AGENTS.md) |
| Building TypeScript packages (SWC, tsconfig, ESM) | [`skills/typescript/AGENTS.md`](./skills/typescript/AGENTS.md) |
| Linting and formatting (ESLint, Biome, auto-fix) | [`skills/linting-formatting/AGENTS.md`](./skills/linting-formatting/AGENTS.md) |
| Running CI locally with Dagger | [`skills/dagger-ci/AGENTS.md`](./skills/dagger-ci/AGENTS.md) |
| Versioning packages with changesets | [`skills/versioning/AGENTS.md`](./skills/versioning/AGENTS.md) |
| Updating catalog dependencies to latest minor/patch versions | [`skills/updating-dependencies/AGENTS.md`](./skills/updating-dependencies/AGENTS.md) |
| Debugging (source maps, cache, test failures) | [`skills/debugging/AGENTS.md`](./skills/debugging/AGENTS.md) |


# Agent Guide

This is an Nx-managed PNPM monorepo. See [nx.dev](https://nx.dev) for general Nx documentation.

This file is the entry point for any coding agent; `CLAUDE.md` is a symlink to it. Put agent-focused documentation in `SKILL.md` files under `.agents/skills/` (or a package's own `.agents/skills/`) and list them under [Skills](#skills). Each `.claude/skills` is a link to the `.agents/skills` beside it, for Claude Code, which reads only that.

Commit messages have a short subject and the reasoning in the body: see [`.agents/skills/commit-messages/SKILL.md`](./.agents/skills/commit-messages/SKILL.md).

## Worktrees

All development happens in git worktrees (kept in `<main checkout>-worktrees/`), each with its own devcontainer. The pnpm store and Nx cache are shared; `node_modules` is not. See [`.agents/skills/worktrees/SKILL.md`](./.agents/skills/worktrees/SKILL.md).

## Nx in This Repo

Nx is **not globally installed**. It ships as a dependency of `@leyman/main` and is on `PATH` via `<worktree>/leyman/main/node_modules/.bin`. **Use `nx` directly — no `npx`, no `pnpm exec`.**

The workspace task lifecycle (install → prepare → check/build → test → verify stages and their sub-targets) is defined in [`nx.json`](./nx.json) — that is the source of truth for how tasks are ordered and what they do.

## Skills

Focused guides for common workflows in this repo:

### Workspace Navigation

| Task | Skill |
|------|-------|
| Running Nx tasks (build, test, check, etc.) | [`.agents/skills/nx-run-tasks/SKILL.md`](./.agents/skills/nx-run-tasks/SKILL.md) |
| Understanding the various projects/packages available | [`.agents/skills/projects/SKILL.md`](./.agents/skills/projects/SKILL.md) |
| Creating a new package in the monorepo | [`.agents/skills/create-package/SKILL.md`](./.agents/skills/create-package/SKILL.md) |
| Installing a package dependency | [`.agents/skills/install-package/SKILL.md`](./.agents/skills/install-package/SKILL.md) |
| What each `nx.json` target does and when to add it to `project.json` | [`.agents/skills/nx-tasks-reference/SKILL.md`](./.agents/skills/nx-tasks-reference/SKILL.md) |
| Task lifecycle wiring (how prepare, check, build, test and verify connect) | [`leyman/main/.agents/skills/lifecycle/SKILL.md`](./leyman/main/.agents/skills/lifecycle/SKILL.md) |
| DevContainer runtimes, CLI tools, and version parity with Dagger | [`.agents/skills/devcontainer/SKILL.md`](./.agents/skills/devcontainer/SKILL.md) |
| Worktree layout, setup, and creating/opening/removing worktrees | [`.agents/skills/worktrees/SKILL.md`](./.agents/skills/worktrees/SKILL.md) |
| Writing and maintaining package READMEs | [`.agents/skills/writing-readmes/SKILL.md`](./.agents/skills/writing-readmes/SKILL.md) |
| Which infrastructure files a fork takes, and classifying a new one | [`.agents/skills/fork-manifest/SKILL.md`](./.agents/skills/fork-manifest/SKILL.md) |
| Writing docs site pages, and keeping them in sync with package changes | [`.agents/skills/docs-site/SKILL.md`](./.agents/skills/docs-site/SKILL.md) |

### Coding Standards

| Topic | Skill |
|-------|-------|
| The principles behind the setup, and why (the package bar, versions, support floors, dependencies, lint, generated content, workarounds, committing and verifying) | [`leyman/configs/skills/principles/SKILL.md`](./leyman/configs/skills/principles/SKILL.md), generated from the [principles page](./docs/src/framework/principles.md) and linked into `.agents/skills` |
| Auditing a repository against the principles, for what a script can't check | [`leyman/framework/skills/framework-audit/SKILL.md`](./leyman/framework/skills/framework-audit/SKILL.md), linked into `.agents/skills` |
| Coding patterns and conventions (package design, types, DI, docs) | [`.agents/skills/coding-patterns/SKILL.md`](./.agents/skills/coding-patterns/SKILL.md) |

### Development Workflows

| Task | Skill |
|------|-------|
| Building a package's CLI (yargs commands, haywire list, launcher) | [`.agents/skills/cli/SKILL.md`](./.agents/skills/cli/SKILL.md) |
| Writing and running tests (Mocha, mocha-chain, Sinon, C8) | [`.agents/skills/testing/SKILL.md`](./.agents/skills/testing/SKILL.md) |
| Building TypeScript packages (SWC, tsconfig, ESM) | [`.agents/skills/typescript/SKILL.md`](./.agents/skills/typescript/SKILL.md) |
| Linting and formatting (ESLint, Biome, auto-fix) | [`.agents/skills/linting-formatting/SKILL.md`](./.agents/skills/linting-formatting/SKILL.md) |
| Running CI locally with Dagger, and releasing to npm | [`.agents/skills/dagger-ci/SKILL.md`](./.agents/skills/dagger-ci/SKILL.md) |
| Patching an older major version of a package (e.g. a security fix for v1 after v2 shipped) | [`.agents/skills/dagger-ci/SKILL.md`](./.agents/skills/dagger-ci/SKILL.md#patching-an-older-major) |
| Versioning packages with changesets | [`.agents/skills/versioning/SKILL.md`](./.agents/skills/versioning/SKILL.md) |
| Writing commit messages (subject, body, what goes where) | [`.agents/skills/commit-messages/SKILL.md`](./.agents/skills/commit-messages/SKILL.md) |
| Updating catalog dependencies to latest minor/patch versions | [`.agents/skills/updating-dependencies/SKILL.md`](./.agents/skills/updating-dependencies/SKILL.md) |
| Debugging (source maps, cache, test failures) | [`.agents/skills/debugging/SKILL.md`](./.agents/skills/debugging/SKILL.md) |


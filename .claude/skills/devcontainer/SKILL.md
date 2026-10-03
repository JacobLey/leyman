---
name: devcontainer
description: DevContainer runtimes, CLI tools, and version parity with Dagger
---

# Skill: DevContainer

> VS Code docs: [Developing inside a Container](https://code.visualstudio.com/docs/devcontainers/containers)

The DevContainer is defined in [`.devcontainer/`](../../../.devcontainer/) and is the canonical development environment for this repo. Opening a worktree in VS Code triggers a prompt to reopen in the container, which builds the image and mounts the main checkout and its sibling `<main>-worktrees/` folder at the same absolute paths they have on the host. See the [worktrees skill](../worktrees/SKILL.md) for the layout and the `nx-cache` sidecar.

Files live on the host, so they survive container rebuilds. Claude Code config is shared across containers via `CLAUDE_CONFIG_DIR`.

**Goal:** every runtime, CLI tool, and script needed for development is available as soon as the container starts, with no manual setup. If you add a tool, add it to the image.

---

## What the DevContainer provides

| Tool | Purpose | Notes |
|---------|--------------------|-------|
| Node.js | JS runtime | Version pinned via `ARG NODE_VERSION` in `Dockerfile` |
| pnpm | Package management | Version pinned via `ARG PNPM_VERSION` |
| Go | Golang runtime (primarily used by Dagger) | Version pinned via `ARG GO_VERSION`; also installs `gopls` |
| Dagger CLI | Mirror CI execution locally | Version pinned via `ARG DAGGER_VERSION` |
| Docker | `docker-outside-of-docker` devcontainer feature | Shares the host Docker socket — required to run Dagger |
| Nx, Biome, ESLint | Workspace tooling | From `leyman/main/node_modules/.bin`, on `PATH` via `remoteEnv` after `postCreateCommand` runs `pnpm install` |
| Local Scripts | Complicated combos of tasks in a single command | `<worktree>/scripts/commands` is on `PATH` (via `remoteEnv`), exposing these shortcuts |

---

## Version parity: DevContainer ↔ Dagger

The Dagger CI pipeline runs in its own container — it does **not** use the DevContainer image. Versions are specified separately in two places and must be kept in sync:

| Runtime | DevContainer | Dagger |
|---------|-------------|--------|
| Node.js | `ARG NODE_VERSION` in `.devcontainer/Dockerfile` | `nodeVersion` in `dagger/test-and-build/main.go` and `dagger/modules/pnpm/main.go` |
| pnpm | `ARG PNPM_VERSION` in `.devcontainer/Dockerfile` | `pnpmVersion` in `dagger/test-and-build/main.go` |
| dagger | `ARG DAGGER_VERSION` in `.devcontainer/Dockerfile` | `engineVersion` in each `dagger.json`, and `DAGGER_VERSION` in `.github/workflows/test.yml` |
| Debian | base image tag in `.devcontainer/Dockerfile` (`debian13`) | `DefaultVersion()` in `dagger/modules/debian/main.go` (`"13.3"`) |

**When upgrading a runtime version, update all locations in the table above.** A mismatch means `dagger-test` runs under a different Node/pnpm version than local development — bugs that only reproduce in CI are a common symptom.

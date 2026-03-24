# Skill: DevContainer

> VS Code docs: [Developing inside a Container](https://code.visualstudio.com/docs/devcontainers/containers)

The DevContainer is defined in [`.devcontainer/`](../../.devcontainer/) and is the canonical development environment for this repo. Opening the repo in VS Code triggers a prompt to reopen in the container, which builds the image and mounts the workspace at `/workspace`.

The main repo is mounted from your local computer, so files changes persist across devcontainer reboots.
It also means credentials for tools like Git or Claude Code can be injected so you don't have to re-auth every time.

**Goal:** every runtime, CLI tool, and script alias needed for development must be available immediately after the container starts, with no manual setup steps.

---

## What the DevContainer provides

### Tool

| Tool | Purpose |Notes |
|---------|--------------------|-------|
| Node.js | JS runtime | Version pinned via `ARG NODE_VERSION` in `Dockerfile` |
| pnpm | Package management | Version pinned via `ARG PNPM_VERSION` |
| Go | Golang runtime (primarily used by Dagger) | Version pinned via `ARG GO_VERSION`; also installs `gopls` |
| Dagger CLI | Mirror CI execution locally | Version pinned via `ARG DAGGER_VERSION` |
| Docker | `docker-outside-of-docker` devcontainer feature | Shares the host Docker socket — required to run Dagger |
| Brew | Package management for CLI tools | Useful for installing some of the other tools, should rarely be required outside devcontainer setup |
| Nx | Monorepo task runner | Available after running `pnpm i`
| Local Scripts | Complicated combos of tasks in a single command | `/workspace/scripts/commands` is on `PATH`, exposing these shortcuts |

---

## Version parity: DevContainer ↔ Dagger

The Dagger CI pipeline runs in its own container — it does **not** use the DevContainer image. Versions are specified separately in two places and must be kept in sync:

| Runtime | DevContainer | Dagger |
|---------|-------------|--------|
| Node.js | `ARG NODE_VERSION` in `.devcontainer/Dockerfile` | `nodeVersion` in `dagger/test-and-build/main.go` and `dagger/modules/pnpm/main.go` |
| pnpm | `ARG PNPM_VERSION` in `.devcontainer/Dockerfile` | `pnpmVersion` in `dagger/test-and-build/main.go` |
| dagger | `ARG DAGGER_VERSION` in `.devcontainer/Dockerfile` | `engineVersion` in each `dagger.json` |
| Debian | base image tag in `.devcontainer/Dockerfile` (`debian13`) | `DefaultVersion()` in `dagger/modules/debian/main.go` (`"13.3"`) |

**When upgrading a runtime version, update all locations in the table above.** A mismatch means `dagger-test` runs under a different Node/pnpm version than local development — bugs that only reproduce in CI are a common symptom.


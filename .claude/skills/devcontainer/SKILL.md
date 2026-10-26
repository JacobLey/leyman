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
| pnpm | Package management | Version pinned via `ARG PNPM_VERSION`. Installed outside the lockfile, so `minimumReleaseAge` can't hold it back: only bump to a release at least 7 days old |
| Go | Golang runtime, for Dagger and Go projects (e.g. `tools/constant-consistent-hash/go-impl`) | Version pinned via `ARG GO_VERSION`; also installs `gopls` |
| Python | Ad-hoc scripting (no projects use it) | Version pinned via `ARG PYTHON_VERSION`, prebuilt by [python-build-standalone](https://github.com/astral-sh/python-build-standalone) at release `ARG PYTHON_BUILD`: only bump to a release at least 7 days old. Not mirrored in Dagger |
| Dagger CLI | Mirror CI execution locally | Version pinned via `ARG DAGGER_VERSION` |
| Playwright browser libraries | System libraries for Chromium, Firefox and WebKit | Version pinned via `ARG PLAYWRIGHT_VERSION`. The browsers themselves are downloaded by the `playwright-install` target to `PLAYWRIGHT_BROWSERS_PATH`, shared between worktrees |
| Docker | `docker-outside-of-docker` devcontainer feature | Shares the host Docker socket — required to run Dagger |
| Valkey | Real service for tests that need one (e.g. `tools/lease-cache`) | `valkey` sidecar in `docker-compose.yml`, reachable at `valkey:6379`. One per worktree, with nothing persisted. Pinned by digest |
| Postgres | Real database for tests that need one | `postgres` sidecar in `docker-compose.yml`, reachable at `DATABASE_URL` (`postgres://postgres:postgres@postgres:5432/postgres`, a fixed local-only password). One per worktree, held in memory (`tmpfs`) so a restart starts from empty; dev data comes from scripts, never from what a database happens to hold. `fsync`, `synchronous_commit` and `full_page_writes` are off for speed (only a machine or VM crash can corrupt it, and nothing is kept anyway), and `max_connections` is 500 for parallel test runs. Pinned by digest |
| Postgres client tools | `psql`, and `pg_dump` for schema snapshots | `postgresql-client-<major>` from the PostgreSQL apt repository, at `ARG POSTGRES_MAJOR`. `pg_dump` must be at least the server's major version |
| HTTPS ingress | `https://<worktree>.<repo>.localhost` to port 5173 of this worktree's container | The `leyman` service joins the external `local-ingress` network, with caddy-docker-proxy labels naming its host and port. Sidecars stay off it, so `postgres` and `valkey` resolve to this worktree's own. `initialize.sh` starts the shared ingress ([`tools/local-ingress`](../../../tools/local-ingress/README.md)) and writes `REPO_NAME` and `WORKTREE_NAME`, which are also in the container's environment. Local only: Dagger has no equivalent |
| GitHub CLI | `gh`, for PRs and issues | Version pinned via `ARG GH_VERSION` (a release at least 7 days old). Not mirrored in Dagger. Its login lives in `GH_CONFIG_DIR` under `.shared/`, so `gh auth login` once, in any container, covers every worktree and rebuild. With no keyring in the container, the token is stored in plain text there: prefer a fine-grained token |
| Nx, Biome, ESLint | Workspace tooling | From `leyman/main/node_modules/.bin`, on `PATH` via `remoteEnv` after `postCreateCommand` runs `pnpm install` |
| Local Scripts | Complicated combos of tasks in a single command | `<worktree>/scripts/commands` is on `PATH` (via `remoteEnv`), exposing these shortcuts |

## Dockerfile layout

The `Dockerfile` is multi-stage, so a version bump rebuilds only what it must (bumping Node rebuilds in seconds, not minutes):

- Each tool (Node, Go and `gopls`, pnpm, Python, `gh`, Dagger) is fetched in its own stage, at the path it has in the final image. The final stage copies them in **last**, after the slow system installs (Postgres client, Playwright's libraries, Homebrew, oh-my-zsh, Claude).
- Declare each `ARG` in the stage that uses it, right before its first use: a changed `ARG` reruns every `RUN` after its declaration in that stage. `ARG`s before the first `FROM` are only for `FROM` lines (the base image, Node and Go).
- Playwright's system libraries: the `playwright-deps` stage lists the packages `install-deps` would install, and the final stage installs that list. The install reruns only when the list changes.
- Node is only the `node` binary, at `/usr/local/bin/node` (no npm). Version-free paths like this one keep editor settings unchanged across bumps.

---

## Version parity: DevContainer ↔ Dagger

The Dagger CI pipeline runs in its own container — it does **not** use the DevContainer image. Versions are specified separately in two places and must be kept in sync:

| Runtime | DevContainer | Dagger |
|---------|-------------|--------|
| Node.js | `ARG NODE_VERSION` in `.devcontainer/Dockerfile` | `nodeImage` tag in `dagger/main.go` |
| pnpm | `ARG PNPM_VERSION` in `.devcontainer/Dockerfile` | `pnpmVersion` in `dagger/main.go` |
| Go | `ARG GO_VERSION` in `.devcontainer/Dockerfile` | `goImage` tag in `dagger/main.go` (pinned by digest, like `nodeImage`) |
| OpenTofu | `ARG TOFU_IMAGE` in `.devcontainer/Dockerfile` | `tofuImage` in `dagger/main.go`. The same image, pinned by digest: only its `tofu` binary is copied in |
| dagger | `ARG DAGGER_VERSION` in `.devcontainer/Dockerfile` | `engineVersion` in `dagger/dagger.json`, and `DAGGER_VERSION` in `.github/workflows/ci.yml` |
| Debian | base image tag in `.devcontainer/Dockerfile` (`debian13`) | `debianImage` in `dagger/main.go`, and the `nodeImage` and `goImage` variants (`trixie` = Debian 13) |
| Playwright | `ARG PLAYWRIGHT_VERSION` in `.devcontainer/Dockerfile` | `playwrightVersion` and the `playwrightImage` tag in `dagger/main.go`. All must match `playwright` in `pnpm-workspace.yaml`. Dagger doesn't install browsers: tests connect to a `playwright` service (`run-server` in the official image, pinned by digest) at `PW_TEST_CONNECT_WS_ENDPOINT`, where the devcontainer launches them locally |
| Valkey | `valkey` service image in `.devcontainer/docker-compose.yml` | `valkeyImage` in `dagger/main.go`. Both pinned by digest, and the service is bound under the same hostname (`valkey`) |
| Postgres | `postgres` service image and `command` settings in `.devcontainer/docker-compose.yml` | `postgresImage` and `postgresService` in `dagger/main.go`. Both pinned by digest, bound under the same hostname (`postgres`), with the same `DATABASE_URL` |
| Postgres client tools | `ARG POSTGRES_MAJOR` in `.devcontainer/Dockerfile` | `postgresMajor` in `dagger/main.go`. Must match the Postgres image's major version |

**When upgrading a runtime version, update all locations in the table above.** `nodeImage` and `goImage` are pinned by digest; get the new one with `docker buildx imagetools inspect node:<tag>` (or `golang:<tag>`). A mismatch means `dagger-test` runs under a different Node/pnpm version than local development — bugs that only reproduce in CI are a common symptom.

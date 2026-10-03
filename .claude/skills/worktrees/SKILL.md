---
name: worktrees
description: Worktree-based development — folder layout, setup, creating/opening/removing worktrees, and what is shared (pnpm store, Nx cache) vs per-worktree (node_modules)
---

# Skill: Worktrees

**Do all development in a git worktree.** Each worktree opens in its own devcontainer. The main checkout still works normally, but it's best left on `main` and used as the place where new worktrees start.

Each worktree has its own `node_modules`, `.nx/` and devcontainer. Downloaded packages and build outputs are shared through `.shared/`.

---

## Layout

The main checkout stays wherever you cloned it. Worktrees go in a **dedicated sibling folder named after it**, so they never collide with your other projects:

```
~/code/
  some-other-project/          <- untouched, never mounted
  leyman/                      <- main checkout, owns .git (never delete it)
  leyman-worktrees/            <- created automatically
    feat-x/                    <- worktree for branch feat/x
    .shared/
      pnpm-store/              <- pnpm content-addressed store
      nx-cache/                <- Nx task outputs (served by the nx-cache sidecar)
      claude-config/           <- CLAUDE_CONFIG_DIR (auth, settings, memory)
```

Every devcontainer, including the one for the main checkout, mounts **two folders: `leyman/` and `leyman-worktrees/`**. Each one is mounted at the same absolute path it has on the host. This has three effects:

- Git stores absolute paths in its worktree links, and those paths resolve both on the host and in the container.
- Every container can reach `.shared/`.
- `docker` bind mounts started from inside the container (docker-outside-of-docker) use paths that are valid on the host.

The container's workspace folder is therefore the host path (for example `/Users/you/code/leyman-worktrees/feat-x`), not `/workspace`.

[`.devcontainer/initialize.sh`](../../../.devcontainer/initialize.sh) runs on the host before the container starts (`initializeCommand`). It does three things:

- Fails if the folder being opened is neither the main checkout nor a direct child of `<main>-worktrees/`.
- Creates `.shared/`. The first time, it moves `<main>/.pnpm-store` into `.shared/` and copies `<main>/.claude-config` there.
- Writes the paths and a namespaced `COMPOSE_PROJECT_NAME` (`leyman`, `leyman_feat-x`) to `.devcontainer/.env`, which is gitignored and read by `docker-compose.yml`. Container names therefore never clash with same-named worktrees from other repos.

---

## First-time switch from the old `/workspace` setup

You don't need to move anything. Open the main checkout and run **Dev Containers: Rebuild and Reopen in Container**:

- `initialize.sh` creates `leyman-worktrees/.shared/` and moves the existing pnpm store and Claude config into it.
- `postCreateCommand` runs `pnpm install`. The existing `node_modules` were linked against the old store path, so pnpm purges and relinks them (`confirmModulesPurge=false`).
- Remove the old container: `docker compose -p leyman_devcontainer down`. That's the old compose project name; check it with `docker compose ls`.

**Claude Code memory:** project data under `.shared/claude-config/projects/` is keyed by path, and the old entry is `-workspace`. After the first launch, find the new entry with `ls .shared/claude-config/projects` and move the old `memory/` into it. Once everything works, you can delete the old `<main>/.claude-config`.

---

## Daily workflow

Run these from a VS Code window opened **locally** on the main checkout (dismiss "Reopen in Container"), or from a host terminal:

| Action | VS Code task | CLI |
|--------|--------------|-----|
| Start work | `Worktree: new` | `scripts/worktree new feat/x [--from main]` |
| Reopen later | `Worktree: open` | `scripts/worktree open feat/x [--local] [--print]` |
| Clean up | `Worktree: remove` | `scripts/worktree rm feat/x [--delete-branch] [--force]` |
| Container without an editor | | `scripts/worktree up feat/x` / `scripts/worktree shell feat/x [cmd...]` |
| List | | `scripts/worktree list` |

- `new` creates `leyman-worktrees/feat-x` (`/` in a branch name becomes `-`). It checks out `feat/x` if that branch exists. Otherwise it creates the branch from `--from`, which defaults to the current `HEAD`. It then opens the folder **directly in its devcontainer**.
- With the default editor (`vscode`), `new` and `open` print a Cmd+clickable `vscode://` link and hand it to the OS (macOS `open`, Linux `xdg-open`). VS Code asks for confirmation ("An external application wants to open…"). Keep that prompt: turning it off lets any app or webpage open a dev container for any folder, which runs that folder's `initializeCommand` on the host. `--no-open` (for `new`) and `--print` (for `open`) only print the link. If the link opens the folder but not the container, use `open --local` and click **Reopen in Container**.
- `rm` runs `docker compose down` on the worktree's devcontainer, which would otherwise keep running, and then `git worktree remove`. It refuses to remove the main checkout or the worktree you're running it from.
- Git won't check out the same branch in two worktrees. With the main checkout on `main`, worktrees branch from `main` rather than checking it out.

The tasks in `.vscode/tasks.json` are meant for a local window. In a container window, nothing launches automatically, but the printed links should still work when clicked.

### Other editors

Only the step that launches the editor is editor-specific. `initialize.sh`, the compose file and `devcontainer.json` follow the open [Dev Containers spec](https://containers.dev). Set `WORKTREE_EDITOR` in your shell profile:

| `WORKTREE_EDITOR` | Behavior |
|---|---|
| `vscode` (default) | Print a `vscode://` link and open it via the OS, as described above |
| `none` | Print only the path. Then use `up`/`shell`, or open the worktree with your IDE's dev container support (for example JetBrains: open `.devcontainer/devcontainer.json`) |

`up` and `shell` use the reference [devcontainer CLI](https://github.com/devcontainers/cli) (`npm install -g @devcontainers/cli`). It runs `initialize.sh`, compose and `postCreateCommand` the same way VS Code does. That makes it the right choice for terminal-only work, for example running Claude Code with `scripts/worktree shell feat/x claude`.

To support another editor, add a case to `open_worktree` in `scripts/worktree` that builds the editor's URL. Only add an editor after its URL format has been confirmed to work.

---

## What's shared vs. per-worktree

| Thing | Scope | Mechanism |
|-------|-------|-----------|
| `node_modules` | per worktree | Normal `pnpm install` (via `postCreateCommand`) |
| pnpm store | shared | `npm_config_store_dir=<worktrees>/.shared/pnpm-store` in `docker-compose.yml` |
| Nx local cache and project graph (`.nx/`) | per worktree | Nx default |
| Nx task outputs | shared | `nx-cache` sidecar ([`nx-cache-server.mjs`](../../../.devcontainer/nx-cache-server.mjs)) via `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` |
| `nx`, `biome`, `eslint`, `scripts/commands` on `PATH` | per worktree | `remoteEnv` in `devcontainer.json` uses `${containerWorkspaceFolder}` |
| Claude config | shared | `CLAUDE_CONFIG_DIR=<worktrees>/.shared/claude-config` |

Why Nx needs a server: Nx 22 only restores artifacts recorded in its per-worktree database (`.nx/workspace-data`). Pointing `NX_CACHE_DIRECTORY` at a shared folder therefore produces cache misses. The sidecar implements Nx's self-hosted remote cache API, and hits show as `[remote cache]` in Nx output. Each container runs its own sidecar, but they all read and write `.shared/nx-cache`.

Dagger sets `npm_config_store_dir=.pnpm-store` and mounts its own cache volume at that path. Never set `storeDir` in `pnpm-workspace.yaml`: it takes precedence over the env var and would split the store.

---

## Agents working inside a container

Every container mounts both folders, so an agent can create and use another worktree without starting a new container:

```sh
scripts/worktree new feat/y --no-open    # prints "Created <path>"
cd <path>
pnpm install                             # fast: shared store
./leyman/main/node_modules/.bin/nx run-many -t test
```

Inside that worktree, call `nx` by its relative path. The `nx` on `PATH` belongs to the worktree the window was opened on.

To give the user a worktree to open, pass along the `Open in devcontainer:` link that `new`/`open --print` prints.

Never `rm` the worktree you are running in; `scripts/worktree` refuses to do it.

---

## Maintenance and troubleshooting

- **"predates worktree support" warning, or "Workspace does not exist"**: the worktree's branch was created before this setup existed, so it still has the old `/workspace` devcontainer config. Merge or rebase it onto `main`.
- **Container fails with "must live in …-worktrees"**: the worktree was created somewhere else, for example nested under `.claude/worktrees/`. Recreate it with `scripts/worktree new`.
- **No `[remote cache]` hits**: from inside the container, run `curl -s -o /dev/null -w '%{http_code}' http://nx-cache:3000/v1/cache/x`. A `404` means the server is up. Hits only happen when task inputs match, and uncommitted changes alter the hashes.
- **The shared Nx cache keeps growing**: the server never evicts anything. Prune it from the host, for example with `find <worktrees>/.shared/nx-cache -name '*.tar' -mtime +30 -delete`.
- **The pnpm store keeps growing**: run `pnpm store prune` in any worktree.

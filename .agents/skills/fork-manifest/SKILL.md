---
name: fork-manifest
description: Which infrastructure files a fork of this repo's patterns takes, how to classify a new one, and how the manifest is checked and audited
---

# Fork manifest

[`leyman/main/fork-manifest.json`](../../../leyman/main/fork-manifest.json) draws the line between a pattern a fork takes and what stays in this repo. Classifying is a judgment written by hand. Everything downstream is derived from it.

A fork is the last of the [adoption tiers](https://jacobley.github.io/leyman/framework/adoption) (source: [`docs/src/framework/adoption.md`](../../../docs/src/framework/adoption.md)): the files that can't be packages. The tiers before it are published packages, which the fork installs from npm. Keep that page in step when what a tier installs, buys or costs changes. [Getting started](https://jacobley.github.io/leyman/framework/getting-started) (source: [`docs/src/framework/getting-started.md`](../../../docs/src/framework/getting-started.md)) walks tiers 1 to 3 from an empty directory. `starter-audit` (`leyman/main/scripts/audit-starter.mjs`) runs every `sh` block of it, in order, then declares the `sync-injected` the page asks for in prose and runs `verify` again; the same weekly workflow runs it against npm. Before releasing a change to a published package the page installs, build them and run `node leyman/main/scripts/audit-starter.mjs --local`, which installs this repository's builds through a global pnpmfile. Keep every `sh` block on the page runnable.

## When you hit it

`check-fork-manifest` fails when a new file under one of the manifest's `roots`, or at the top of the workspace, isn't classified. Add one line:

- `entries`: a fork takes it. Add `when` if only some forks need it, and `why` in one line.
- `repoOnly`: it stays here. `why` says what ties it to this repo.

An `nx.json` target, named input or plugin that belongs to one condition goes under `nx` too, so a fork without that condition doesn't get it. Anything else in `nx.json` goes to every fork.

## What portable means

A file is portable if it works with the other entries and nothing else. It may mention this repo in a comment, but it can't need a path that a fork doesn't have. If it does, either make it stop needing that (as `lifecycle.json` points its `$schema` into `node_modules`) or put it in `repoOnly` with that as the reason, so the gap stays visible.

## What checks it

| What | When | What it catches |
|------|------|-----------------|
| `check-fork-manifest` | Every `verify` and CI run, under a second | Unclassified files, stale paths and conditions, and anything an applied fork names that didn't come along, with no optional conditions and with all of them |
| `fork-manifest-audit` | By hand and weekly, never in `verify` | What only shows up when a fork runs: applies the manifest with `tools/parse-cwd`, installs from nothing, runs `verify` and checks for lifecycle drift, and that `drift` reports nothing right after `apply` |

The audit runs without any optional condition, so it doesn't prove the conditional files work. It also doesn't read the skills, which still name this repo's packages as examples.

To try a fork by hand, `node leyman/main/scripts/fork-manifest.mjs apply --to <dir> --with go,rust --package tools/parse-cwd` prints what it skipped and why. To audit from CI, run the `Adoption audits` workflow. To audit in Dagger, `dagger call --mod ./dagger fork-manifest-audit`.

## Keeping a fork current

`apply` writes `leyman-upstream.json` into the fork: this repository's URL, the commit it copied from, the `with` conditions and extra packages, and each file it copied. From an up-to-date checkout here (with full history, so it has that commit):

- `node leyman/main/scripts/fork-manifest.mjs drift --fork <dir>` lists, for each recorded file, the commits since then that touched it (marking files removed or moved here), and the files added since then under what the fork takes, with the `git diff` command that shows a change.
- `node leyman/main/scripts/fork-manifest.mjs resync --fork <dir>` moves the record to this checkout's commit, keeping the files of what the fork takes that the fork still has.

`drift` never compares the fork's files with these: a fork keeps its own values (the Node version, images, names), so only what changed here is news, and its owner decides what fits. Commit here before running `apply`, as the record names `HEAD` and uncommitted changes aren't part of it.

## What a fork gets

Generated from the manifest by `node leyman/main/scripts/fork-manifest.mjs render`. `check-fork-manifest` fails if it drifts.

<!-- fork-manifest:start -->
### Every fork

| Path | Why |
|------|-----|
| `.agents/skills/.gitignore` | pnpm's list of the skill links it makes, which aren't committed |
| `.claude/skills` | links Claude Code's skills directory to .agents/skills, which other agents read |
| `.agents/skills/coding-patterns` | package design, types and DI conventions |
| `.agents/skills/commit-messages` | subject and body conventions |
| `.agents/skills/create-package` | how to add a package |
| `.agents/skills/debugging` | source maps, the cache and test failures |
| `.agents/skills/devcontainer` | runtimes, CLI tools and version parity |
| `.agents/skills/install-package` | how to add a dependency |
| `.agents/skills/linting-formatting` | ESLint, Biome and auto-fix |
| `.agents/skills/nx-run-tasks` | how to run Nx tasks |
| `.agents/skills/nx-tasks-reference` | what each target does and when to add it |
| `.agents/skills/testing` | Mocha, mocha-chain, Sinon and c8 |
| `.agents/skills/typescript` | SWC, tsconfig and ESM |
| `.agents/skills/updating-dependencies` | how to bump the catalog |
| `.agents/skills/worktrees` | the worktree layout and flow |
| `.agents/skills/writing-readmes` | the README bar |
| `.devcontainer/.dockerignore` | keeps the image's build context empty |
| `.devcontainer/Dockerfile` | the image everything runs in; delete the stages of languages the fork lacks. `apply` names its user after the fork |
| `.devcontainer/devcontainer-lock.json` | pins the devcontainer features |
| `.devcontainer/devcontainer.json` | the container's environment and post-create steps. `apply` names the container, its service and user after the fork |
| `.devcontainer/docker-compose.yml` | the container and its sidecars. `apply` names its service after the fork |
| `.devcontainer/initialize.sh` | writes the worktree's .env on the host, links the shared Claude settings; tolerates a missing local-ingress |
| `.devcontainer/names.sh` | the worktree's DNS labels |
| `.devcontainer/nx-cache-server.mjs` | the Nx cache shared by worktrees, which the compose file always mounts |
| `.devcontainer/tag-pinned-images.sh` | keeps digest-pinned images from looking dangling |
| `.vscode/settings.json` | points the editor at the tools in leyman/main |
| `.vscode/tasks.json` | worktree commands in the editor |
| `leyman/main/.claude/skills` | links Claude Code's skills directory to the package's .agents/skills |
| `leyman/main/.agents/skills/lifecycle` | how the lifecycle stages connect |
| `leyman/main/README.md` | why the global tools live in this package |
| `leyman/main/eslint.config.js` | lints the package's own scripts |
| `leyman/main/lifecycle.json` | declares the stages and binds targets to them |
| `leyman/main/nx-plugin.json` | the options the TypeScript targets in nx.json are written from |
| `leyman/main/package.json` | the global tools |
| `leyman/main/project.json` | the lifecycle targets of the tools package |
| `patches/nx@23.3.1.patch` | the Nx planner patch that keeps daemon-less runs fast |
| `patches/@typescript-eslint__eslint-plugin@8.72.1.patch` | a wrong autofix under the v flag, which the eslint config's rules reach |
| `scripts/commands/test-and-fix` | verify with auto-fix |
| `scripts/commands/test-ci` | verify |
| `scripts/commands/test-only` | test |
| `scripts/commands/yolo-claude` | the agent without prompts, in the container |
| `scripts/worktree` | creates and opens worktrees from the host |
| `.gitattributes` | marks generated output |
| `.gitignore` | what the targets write and nothing should commit |
| `.nx/installation` | the link that lets Nx find plugins in leyman/main, so the root package.json stays empty |
| `AGENTS.md` | the agent entry point |
| `CLAUDE.md` | links to AGENTS.md |
| `biome.json` | formatting rules |
| `nx.json` | target defaults, named inputs and lifecycle targets |
| `package.json` | stays empty by design |
| `pnpm-workspace.yaml` | the catalog and workspace globs |
| `tsconfig.base.json` | empty on purpose, so Nx hashes it in place of tsconfig.json |
| `tsconfig.json` | the TypeScript project root |

### `ci`: runs CI on GitHub Actions

| Path | Why |
|------|-----|
| `.github/pull_request_template.md` | the PR checklist |
| `.github/workflows/ci.yml` | the CI workflow |

### `cli`: has packages with a command line interface

| Path | Why |
|------|-----|
| `.agents/skills/cli` | yargs commands collected by a haywire list |

### `dagger`: runs CI through the Dagger module

| Path | Why |
|------|-----|
| `.agents/skills/dagger-ci` | running CI locally and releasing |
| `scripts/commands/dagger-develop` | regenerates the Dagger module's code |
| `scripts/commands/dagger-test` | runs CI locally |
| `scripts/nx/dagger-develop.sh` | the dagger-develop target |
| `dagger` | the CI module, to copy and adapt |

### `docs-site`: has a VitePress docs site

| Path | Why |
|------|-----|
| `.agents/skills/docs-site` | writing docs pages |
| `.claude/rules/docs-site-sync.md` | keeps docs pages in step with their packages |

### `drizzle`: has packages with Drizzle migrations

| Path | Why |
|------|-----|
| `scripts/nx/drizzle-kit-check.sh` | the drizzle-kit-check target |

### `go`: has Go projects

| Path | Why |
|------|-----|
| `scripts/nx/go-coverage-report.sh` | the go-coverage-report target |
| `scripts/nx/gofmt.sh` | the gofmt target |
| `leyman/main/scripts/check-go-release.mjs` | the check-go-release target |
| `scripts/go-release.sh` | CI's check and tagging of released Go modules |
| `.golangci.yml` | the go-lint target's rules |

### `local-ingress`: serves worktrees at https://<worktree>.<repo>.localhost

| Path | Why |
|------|-----|
| `scripts/commands/serve` | runs a project's dev server at the worktree's URL |
| `tools/local-ingress` | the machine's shared HTTPS ingress |

### `publishing`: publishes packages to npm with changesets

| Path | Why |
|------|-----|
| `.agents/skills/versioning` | changesets |
| `.changeset/config.json` | how changesets versions packages |

### `rust`: has Rust crates

| Path | Why |
|------|-----|
| `leyman/main/scripts/nx-rust-plugin.mjs` | infers a crate's Nx targets |
| `scripts/nx/rust-coverage-report.sh` | the rust-coverage-report target |
| `scripts/nx/rustfmt.sh` | the rustfmt target |
| `Cargo.toml` | the workspace's crates |
| `Cargo.lock` | the crates' resolved versions |

### `tofu`: has OpenTofu projects

| Path | Why |
|------|-----|
| `scripts/nx/tofu-fmt.sh` | the tofu-fmt target |
| `scripts/nx/tofu-validate.sh` | the tofu-validate target |

### `vscode-tests`: wants the editor's test explorer

| Path | Why |
|------|-----|
| `.vscode/extensions/leyman-tests` | loads the test explorer from leyman/vscode-tests |
| `leyman/vscode-tests` | vendor: what the test explorer extension loads |

### Stays in this repo

| Path | Why |
|------|-----|
| `.agents/skills/framework-audit` | a link to @leyman/framework's source; a fork has pnpm link its installed copy (permissions in pnpm-workspace.yaml, which nx-plugin init sets) |
| `.agents/skills/eslint-config` | a link to @leyman/eslint-config's source; a fork has pnpm link its installed copy (permissions in pnpm-workspace.yaml, which nx-plugin init sets) |
| `.agents/skills/principles` | a link to @leyman/configs' source; a fork has pnpm link its installed copy (permissions in pnpm-workspace.yaml, which nx-plugin init sets) |
| `.agents/skills/mocha-chain` | a link to mocha-chain's source; a fork has pnpm link its installed copy (permissions in pnpm-workspace.yaml, which nx-plugin init sets) |
| `.agents/skills/nx-lifecycle` | a link to nx-lifecycle's source; a fork has pnpm link its installed copy (permissions in pnpm-workspace.yaml, which nx-plugin init sets) |
| `.agents/skills/fork-manifest` | how this repo's classification works; a fork keeps the list of what it took |
| `.agents/skills/projects` | this repo's table of packages; a fork writes its own |
| `.github/ISSUE_TEMPLATE` | names this repo's packages and links |
| `.github/workflows/comparison-report.yml` | reports on genever against other tools, for this repo's docs site |
| `.github/workflows/adoption-audits.yml` | audits this repo's classification and getting-started page |
| `CODE_OF_CONDUCT.md` | a fork writes its own |
| `CONTRIBUTING.md` | a fork writes its own |
| `DEPRECATED_PACKAGES.md` | this repo's published history |
| `LICENSE` | a fork chooses its own |
| `README.md` | a fork writes its own |
| `SECURITY.md` | a fork writes its own |
| `docs` | this repo's docs site content |
| `e2e` | tests of this repo's published packages |
| `infra` | this repo's hosted cache deployment |
| `leyman/main/fork-manifest.json` | this repo's classification; a fork keeps the list of what it took |
| `leyman/main/scripts/audit-fork-manifest.mjs` | proves this repo's classification by running it |
| `leyman/main/scripts/audit-starter.mjs` | runs this repo's getting-started page |
| `leyman/main/scripts/check-fork-manifest.mjs` | checks this repo's classification |
| `leyman/main/scripts/check-parity.mjs` | anchored on this repo's Dockerfile, compose file and Dagger module |
| `leyman/main/scripts/check-workspace-dependencies.mjs` | only matters to a workspace that also publishes what it depends on |
| `leyman/main/scripts/fork-manifest.mjs` | applies this repo's classification; a fork keeps the list of what it took |
| `pnpm-lock.yaml` | a fork resolves its own after pruning the catalog |
| `apps/check-package` | on npm as @leyman/check-package: a fork installs it |
| `leyman/configs` | on npm as @leyman/configs: a fork installs it |
| `leyman/eslint-config` | on npm as @leyman/eslint-config: a fork installs it |
| `leyman/expect` | on npm as @leyman/expect: a fork installs it |
| `leyman/framework` | on npm as @leyman/framework: a fork runs it |
| `leyman/nx-plugin` | on npm as @leyman/nx-plugin: a fork installs it |
| `leyman/main/scripts/link-skills.mjs` | links this workspace's packages' skills to their source; a fork installs the packages, and pnpm links their skills |

<!-- fork-manifest:end -->

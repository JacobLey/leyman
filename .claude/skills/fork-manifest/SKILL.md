---
name: fork-manifest
description: Which infrastructure files a fork of this repo's patterns takes, how to classify a new one, and how the manifest is checked and audited
---

# Fork manifest

[`leyman/main/fork-manifest.json`](../../../leyman/main/fork-manifest.json) draws the line between a pattern a fork takes and what stays in this repo. Classifying is a judgement written by hand. Everything downstream is derived from it.

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
| `XXcheck-fork-manifest` | Every `verify` and CI run, under a second | Unclassified files, stale paths and conditions, and anything an applied fork names that didn't come along, with no optional conditions and with all of them |
| `fork-manifest-audit` | By hand and weekly, never in `verify` | What only shows up when a fork runs: applies the manifest with `tools/parse-cwd`, installs from nothing, runs `verify` and checks for lifecycle drift |

The audit runs without any optional condition, so it doesn't prove the conditional files work. It also doesn't read the skills, which still name this repo's packages as examples.

To try a fork by hand, `node leyman/main/scripts/fork-manifest.mjs apply --to <dir> --with go,rust --package tools/parse-cwd` prints what it skipped and why. To audit from CI, run the `Fork manifest` workflow. To audit in Dagger, `dagger call --mod ./dagger fork-manifest-audit`.

## What a fork gets

Generated from the manifest by `node leyman/main/scripts/fork-manifest.mjs render`. `check-fork-manifest` fails if it drifts.

<!-- fork-manifest:start -->
### Every fork

| Path | Why |
|------|-----|
| `.claude/skills/coding-patterns` | package design, types and DI conventions |
| `.claude/skills/create-package` | how to add a package |
| `.claude/skills/debugging` | source maps, the cache and test failures |
| `.claude/skills/devcontainer` | runtimes, CLI tools and version parity |
| `.claude/skills/install-package` | how to add a dependency |
| `.claude/skills/linting-formatting` | ESLint, Biome and auto-fix |
| `.claude/skills/nx-run-tasks` | how to run Nx tasks |
| `.claude/skills/nx-tasks-reference` | what each target does and when to add it |
| `.claude/skills/testing` | Mocha, mocha-chain, Sinon and c8 |
| `.claude/skills/typescript` | SWC, tsconfig and ESM |
| `.claude/skills/updating-dependencies` | how to bump the catalog |
| `.claude/skills/worktrees` | the worktree layout and flow |
| `.claude/skills/writing-readmes` | the README bar |
| `.devcontainer/.dockerignore` | keeps the image's build context empty |
| `.devcontainer/Dockerfile` | the image everything runs in; delete the stages of languages the fork lacks |
| `.devcontainer/devcontainer-lock.json` | pins the devcontainer features |
| `.devcontainer/devcontainer.json` | the container's environment and post-create steps |
| `.devcontainer/docker-compose.yml` | the container and its sidecars |
| `.devcontainer/initialize.sh` | writes the worktree's .env on the host; tolerates a missing local-ingress |
| `.devcontainer/names.sh` | the worktree's DNS labels |
| `.devcontainer/nx-cache-server.mjs` | the Nx cache shared by worktrees, which the compose file always mounts |
| `.devcontainer/tag-pinned-images.sh` | keeps digest-pinned images from looking dangling |
| `.vscode/settings.json` | points the editor at the tools in leyman/main |
| `.vscode/tasks.json` | worktree commands in the editor |
| `configs/c8rc.json` | coverage thresholds and reporters every test target reads |
| `configs/swcrc.jsonc` | how every target compiles TypeScript |
| `configs/tsconfig.build.json` | the type checking contract for source |
| `configs/tsconfig.test.json` | the type checking contract for tests |
| `leyman/main/.claude/skills/lifecycle` | how the lifecycle stages connect |
| `leyman/main/README.md` | why the global tools live in this package |
| `leyman/main/eslint.config.js` | lints the package's own scripts |
| `leyman/main/lifecycle.json` | declares the stages and binds targets to them |
| `leyman/main/package.json` | the global tools |
| `leyman/main/project.json` | the lifecycle targets of the tools package |
| `leyman/main/scripts/check-package.mjs` | checks a package as it would be published |
| `leyman/main/scripts/sync-injected.mjs` | mirrors a package into its injected copies |
| `patches/nx@23.3.1.patch` | the Nx planner patch that keeps daemon-less runs fast |
| `patches/@typescript-eslint__eslint-plugin@8.72.0.patch` | a wrong autofix under the v flag, which the eslint config's rules reach |
| `scripts/commands/test-and-fix` | verify with auto-fix |
| `scripts/commands/test-ci` | verify |
| `scripts/commands/test-only` | test |
| `scripts/commands/yolo-claude` | the agent without prompts, in the container |
| `scripts/nx/biome-format.sh` | the biome target |
| `scripts/nx/clean-dist.sh` | the tsc target |
| `scripts/nx/coverage-report.sh` | the coverage-report target |
| `scripts/nx/swc-compile.sh` | the tsc and tsc-test targets |
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
| `leyman/eslint-config` | vendor until published: every package's eslint.config.js imports it |
| `leyman/expect` | vendor until published: the test assertion package |

### `ci`: runs CI on GitHub Actions

| Path | Why |
|------|-----|
| `.github/pull_request_template.md` | the PR checklist |
| `.github/workflows/ci.yml` | the CI workflow |

### `cli`: has packages with a command line interface

| Path | Why |
|------|-----|
| `.claude/skills/cli` | yargs commands collected by a haywire list |

### `dagger`: runs CI through the Dagger module

| Path | Why |
|------|-----|
| `.claude/skills/dagger-ci` | running CI locally and releasing |
| `scripts/commands/dagger-develop` | regenerates the Dagger module's code |
| `scripts/commands/dagger-test` | runs CI locally |
| `scripts/nx/dagger-develop.sh` | the dagger-develop target |
| `dagger` | the CI module, to copy and adapt |

### `docs-site`: has a VitePress docs site

| Path | Why |
|------|-----|
| `.claude/skills/docs-site` | writing docs pages |
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
| `.golangci.yml` | the go-lint target's rules |

### `local-ingress`: serves worktrees at https://<worktree>.<repo>.localhost

| Path | Why |
|------|-----|
| `scripts/commands/serve` | runs a project's dev server at the worktree's URL |
| `tools/local-ingress` | the machine's shared HTTPS ingress |

### `publishing`: publishes packages to npm with changesets

| Path | Why |
|------|-----|
| `.claude/skills/versioning` | changesets |
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

### `vitest`: has packages tested with Vitest

| Path | Why |
|------|-----|
| `configs/vitest.config.js` | the shared Vitest settings |

### `vscode-tests`: wants the editor's test explorer

| Path | Why |
|------|-----|
| `.vscode/extensions/leyman-tests` | loads the test explorer from leyman/vscode-tests |
| `leyman/vscode-tests` | vendor: what the test explorer extension loads |

### Stays in this repo

| Path | Why |
|------|-----|
| `.claude/skills/fork-manifest` | how this repo's classification works; a fork keeps the list of what it took |
| `.claude/skills/projects` | this repo's table of packages; a fork writes its own |
| `.github/ISSUE_TEMPLATE` | names this repo's packages and links |
| `.github/workflows/comparison-report.yml` | reports on genever against other tools, for this repo's docs site |
| `.github/workflows/fork-manifest.yml` | audits this repo's classification |
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
| `leyman/main/scripts/check-fork-manifest.mjs` | checks this repo's classification |
| `leyman/main/scripts/check-parity.mjs` | anchored on this repo's Dockerfile, compose file and Dagger module |
| `leyman/main/scripts/check-workspace-dependencies.mjs` | only matters to a workspace that also publishes what it depends on |
| `leyman/main/scripts/fork-manifest.mjs` | applies this repo's classification; a fork keeps the list of what it took |
| `pnpm-lock.yaml` | a fork resolves its own after pruning the catalog |

<!-- fork-manifest:end -->

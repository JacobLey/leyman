# main

Holds the repo's global tools and repo-wide scripts, without exposing them to every package.

It is not published.

## Global tools

Nx, ESLint, Biome, Changesets, TypeScript and the like are dependencies of this package, so they are installed once and aren't available to every other package. The devcontainer puts `leyman/main/node_modules/.bin` on `PATH`, which is why `nx` and the others run without `npx` or `pnpm exec`.

## Lifecycle

[`lifecycle.json`](./lifecycle.json) declares the workspace's task stages and binds work targets to them. `nx run @leyman/main:lifecycle` turns that into the no-op lifecycle targets and their `dependsOn` in every `project.json`. See the [lifecycle skill](./.claude/skills/lifecycle/SKILL.md).

## Scripts

| Script                                                                           | Purpose                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`check-package.mjs`](./scripts/check-package.mjs)                               | Checks a package exactly as it would be published: lints the packed tarball with publint, checks its types resolve with Are The Types Wrong, and type checks its declarations as a strict consumer would |
| [`check-fork-manifest.mjs`](./scripts/check-fork-manifest.mjs)                   | Checks that [`fork-manifest.json`](./fork-manifest.json) classifies every pattern file a fork could take, that everything it names exists, and that what it applies hangs together                       |
| [`fork-manifest.mjs`](./scripts/fork-manifest.mjs)                               | Copies what the manifest says a fork takes into a directory, and cuts the shared configs down to it                                                                                                      |
| [`audit-fork-manifest.mjs`](./scripts/audit-fork-manifest.mjs)                   | Applies the manifest with one real package, installs it from nothing and runs `verify`. Not part of `verify` itself                                                                                      |
| [`check-parity.mjs`](./scripts/check-parity.mjs)                                 | Checks that the versions the devcontainer and CI pin separately still match                                                                                                                              |
| [`check-workspace-dependencies.mjs`](./scripts/check-workspace-dependencies.mjs) | Checks that nothing takes a package in this workspace from npm rather than `workspace:`                                                                                                                  |
| [`nx-rust-plugin.mjs`](./scripts/nx-rust-plugin.mjs)                             | Infers a Rust crate's Nx targets and workspace dependencies from its `Cargo.toml`, because no maintained plugin supports this repo's Nx                                                                  |
| [`sync-injected.mjs`](./scripts/sync-injected.mjs)                               | Mirrors a package into the copies injected into its dependents after every build, and writes the part of its `package.json` that dependents hash. Never cached                                           |

## Why the root `package.json` has no dependencies

Nx looks for plugins, executors and generators by package name from `.nx/installation`, then from the workspace root. [`.nx/installation`](../../.nx/installation) is a committed symlink to this package, so what Nx needs (`@naxodev/gonx`, `@nx/js`) is found here, and `nx.json` keeps using plain package names. Nx also runs the `nx` from this package because of it.

That directory is where Nx keeps its own install in a workspace with no root `package.json`. This repo only borrows the lookup: `nx.json` has no `installation` entry, so Nx never installs anything there.

`@nx/js` imports `typescript` without declaring it, so `pnpm-workspace.yaml` adds it as a peer through `packageExtensions`, which resolves to this package's.

Add anything Nx or the repo as a whole needs to this package, not to the root.

# main

Package to contain high level monorepo scripts without exposing packages to entire workspace.

It is not published. It holds what belongs to the repo as a whole rather than to one package.

## Global tools

Nx, ESLint, Biome, Changesets, TypeScript and the like are dependencies of this package, so they are installed once and aren't available to every other package. The devcontainer puts `leyman/main/node_modules/.bin` on `PATH`, which is why `nx` and the others run without `npx` or `pnpm exec`.

## Lifecycle

[`lifecycle.json`](./lifecycle.json) declares the workspace's task stages and binds work targets to them. `nx run @leyman/main:lifecycle` turns that into the no-op lifecycle targets and their `dependsOn` in every `project.json`. See the [lifecycle skill](./.claude/skills/lifecycle/SKILL.md).

## Scripts

| Script | Purpose |
|--------|---------|
| [`check-package.mjs`](./scripts/check-package.mjs) | Checks a package exactly as it would be published: lints the packed tarball with publint, checks its types resolve with Are The Types Wrong, and type checks its declarations as a strict consumer would |
| [`nx-rust-plugin.mjs`](./scripts/nx-rust-plugin.mjs) | Infers a Rust crate's Nx targets and workspace dependencies from its `Cargo.toml`, because no maintained plugin supports this repo's Nx |
| [`sync-injected.mjs`](./scripts/sync-injected.mjs) | Mirrors a package into the copies injected into its dependents after every build. Never cached |

## Why the root `package.json` has dependencies too

Global tools live here, with four exceptions in the workspace root's `package.json`. Nx looks for these from the workspace root, and fails without them:

| Dependency | Needed by | Without it |
|------------|-----------|------------|
| `@naxodev/gonx` | The Go plugin listed in `nx.json` | No `nx` command that loads the project graph runs |
| `@nx/js` | The `@nx/js:typescript-sync` sync generator | `nx sync` can't resolve the generator |
| `typescript` | That sync generator, which loads it as a library | `nx sync` can't find the module |

The fourth, `@typescript/native`, is the `tsc` binary that pairs with `typescript`, as in every package that compiles TypeScript. Neither Nx's project graph nor `nx sync` needs it at the root.

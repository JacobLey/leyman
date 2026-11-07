---
description: "Four tiers of adopting this repository's setup, from published checks to the whole devcontainer and CI: what each installs, what it buys and what it costs."
---

# Adoption tiers

The setup comes in four tiers. The first three are npm packages: install them, and upgrade when you choose. The fourth is files you copy. Each tier works without the ones after it, so stop wherever the next one costs more than it buys.

| Tier                                                             | You get                                                          | How                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| [1. Checks](#_1-checks)                                          | Strict lint, and a check of each package as npm will get it      | Install two packages              |
| [2. Shared configs](#_2-shared-configs)                          | TypeScript, SWC, c8, Biome and Vitest configs, one per concern   | Install one package, extend it    |
| [3. Nx plugin and lifecycle](#_3-nx-plugin-and-lifecycle)        | Every build, test and lint target inferred, cached and ordered   | `nx add @leyman/nx-plugin`        |
| [4. Devcontainer, CI and skills](#_4-devcontainer-ci-and-skills) | The same toolchain locally and in CI, releases, and agent skills | Copy files with the fork manifest |

All of it assumes TypeScript packages published as ESM.

To see where a repository stands, run [`@leyman/framework`](https://www.npmjs.com/package/@leyman/framework)'s audit in it. It runs a check for each tier, reports the highest tier met, and gives the fix for each gap. It also prints the path of a skill that has a coding agent audit what needs judgment against the [principles](/framework/principles):

```sh
pnpm dlx @leyman/framework audit
```

## 1. Checks

Install [`@leyman/check-package`](https://www.npmjs.com/package/@leyman/check-package) and [`@leyman/eslint-config`](https://www.npmjs.com/package/@leyman/eslint-config) in any repository, Nx or not.

**What it buys**

- `check-package` packs a package with your package manager and checks the tarball: publint, Are The Types Wrong, a strict typecheck of the published declarations, the Node.js support floor (`engines.node`, `@types/node` and every runtime dependency agree), and that every top-level file is either published or known not to be. Most broken releases fail one of these.
- `@leyman/eslint-config` turns on nearly every rule of ESLint and ten plugins, type-aware, with each exception explained, generated from the package's `package.json`. Its plugins take patch releases only, so new rules arrive with a release of the config.
- [`@leyman/expect`](https://www.npmjs.com/package/@leyman/expect) is optional: Chai and chai-as-promised as one import, which this setup's tests use.

**What it costs**

- ESLint 10 with a flat config, and formatting left to Biome or Prettier.
- On an existing codebase, expect a long first list of errors. The config is opinionated to a fault on purpose: turn off what doesn't fit in your own `eslint.config.js`, with a reason.
- Type-aware lint is slower than syntax-only lint.
- `check-package` wants `engines.node` as a floor (`>=22`), a matching `@types/node`, and a `files` allow-list.

## 2. Shared configs

Install [`@leyman/configs`](https://www.npmjs.com/package/@leyman/configs) in each package, and extend or point at its files.

**What it buys**

- A tsconfig per Node.js support floor (`tsconfig.node-22.json`, `tsconfig.node-24.json`), holding only the `lib` and `target` that version has, so using a newer API is a compile error rather than a crash for your oldest users. Strict options throughout.
- One SWC, c8, Biome and Vitest config, shared rather than copied, upgraded with the package.

**What it costs**

- TypeScript 6 or newer, Biome 2.6, c8 12, `@swc/core` 1.16 and Vitest 5, for the configs you use.
- c8 fails below 100% coverage of lines, statements, functions and branches.
- Each package installs `@leyman/configs`, since its tools find the files in its own `node_modules`.

## 3. Nx plugin and lifecycle

In an Nx workspace, run `nx add @leyman/nx-plugin`. It installs [`@leyman/nx-plugin`](https://www.npmjs.com/package/@leyman/nx-plugin) and runs its `init` generator, which adds it and [nx-lifecycle](/packages/nx-lifecycle/) to `nx.json`, installs tiers 1 and 2 at the root, and writes the root files the targets need. Add packages with `nx g @leyman/nx-plugin:package`. [Getting started](/framework/getting-started) walks through it from an empty directory.

**What it buys**

- Every package's targets inferred from its files: an SWC build with a `tsc` typecheck, Mocha or Vitest under c8 with one coverage report across them, ESLint, Biome, `check-package` for public packages, and the TypeScript project references kept in sync.
- Precise caching: each target hashes only what its result depends on, its sources, the shared configs and its dependencies' built output, so changing one package's tests reruns nothing downstream.
- One order for everything: install, prepare, check, build, test and verify, wired by nx-lifecycle. `nx run-many -t verify` is the whole check of the workspace.
- A `package` generator that writes a new package with its targets declared, so it is verified from its first commit.

**What it costs**

- Nx, and this layout in every package: `src/` built to `dist/`, tests in `test/unit/` and `test/integration/`.
- pnpm with `injectWorkspacePackages`, which `init` sets: a package's dependents get it as published, not its source, and a `sync-injected` target keeps those copies current after each build.
- Tiers 1 and 2, as the targets run them.

## 4. Devcontainer, CI and skills

The rest can't be a package: a devcontainer per git worktree, CI through [Dagger](https://dagger.io/) on GitHub Actions, releases with changesets, and the skills coding agents read about this repository's way of working. The skills about a package (its config, its lifecycle, its test helpers) ship with it instead, at any tier: pnpm 12.11 or later links them into `.agents/skills` once approved under `permissions` in `pnpm-workspace.yaml`, which the plugin's `init` sets, so they change with the version. A clone of this repository copies them into a new repository with the [fork manifest](https://github.com/JacobLey/leyman/blob/main/.agents/skills/fork-manifest/SKILL.md), which installs tiers 1 to 3 from npm:

```sh
node leyman/main/scripts/fork-manifest.mjs apply --to <your repository> --with ci,dagger,publishing
```

`--with` takes the optional parts you want: Go, Rust, Postgres or Valkey sidecars, Playwright, a docs site and more.

**What it buys**

- The same toolchain everywhere: the devcontainer image is what Dagger runs CI in, and each worktree gets its own container and sidecars, sharing one Nx cache.
- CI you can run locally (`dagger call`), and releases from a merged version PR, published with provenance.
- Skills and an `AGENTS.md` that let a coding agent work in the repository from its first session, with the [principles](/framework/principles) behind every choice.

**What it costs**

- Docker, and Dagger for CI.
- You own what you copy. Packages upgrade through their changelogs; copied files don't. `apply` records in `leyman-upstream.json` the commit it copied from and what it took, and from a checkout of this repository `node leyman/main/scripts/fork-manifest.mjs drift --fork <your repository>` lists the commits since then that touched those files, and the files new to the parts you took. You decide what to bring over, since your copies hold your own versions and names, then `resync --fork <your repository>` records that you're caught up.
- The skills name this repository's packages as examples until you rewrite them.

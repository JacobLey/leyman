---
description: 'From an empty directory to a first package that passes verify, with the published Nx plugin and its generators.'
---

# Getting started

<!-- A weekly audit runs every sh block here, in order, in one shell: leyman/main/scripts/audit-starter.mjs. Keep each one runnable. -->

This walks from an empty directory to a first package that passes `verify`. It takes [tiers 1 to 3](/framework/adoption) of the setup, all from npm. It was last run with pnpm 12 and Nx 24.

## 1. Create the workspace

```sh
mkdir my-workspace && cd my-workspace
git init
echo '{ "name": "my-workspace", "private": true }' > package.json
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - packages/*
allowBuilds:
  nx: false
EOF
pnpm add -D nx
```

pnpm stops on any install script it hasn't been told about. Nx doesn't need its own, so `allowBuilds` skips it.

Already have an Nx workspace on pnpm? Start at step 2. `init` leaves alone anything it finds already set.

## 2. Add the plugin

```sh
pnpm nx add @leyman/nx-plugin
```

This installs [`@leyman/nx-plugin`](https://www.npmjs.com/package/@leyman/nx-plugin) and runs its `init` generator, which writes:

- In `nx.json`, the plugin and [nx-lifecycle](/packages/nx-lifecycle/), with the stages install, prepare, check, build, test and verify. Every target the plugin infers is bound to one of them.
- In the root `package.json`, the tools the targets run: the shared configs, check-package, Biome, TypeScript and `@nx/js`.
- A `biome.json`, a `tsconfig.json` that Nx keeps a reference to each package in, and a `.gitignore` for what the targets write.
- In `pnpm-workspace.yaml`, injected workspace packages, so a dependent gets a package as it would be published, plus `allowBuilds` for SWC.
- For coding agents, approval in `pnpm-workspace.yaml` for pnpm to link the skills the framework's packages ship (the principles among them) into `.agents/skills`, which most agents read, and `.claude/skills` as a link to it, for Claude Code. The skills change with the versions installed.

The [plugin's README](https://github.com/JacobLey/leyman/tree/main/leyman/nx-plugin#init) lists each one in full.

## 3. Add a package

```sh
pnpm nx g @leyman/nx-plugin:package packages/my-lib --description "Does one thing well."
pnpm nx sync
```

This writes a TypeScript ESM package with `src/index.ts`, a first test, its `tsconfig.json`, an `eslint.config.js`, a README and a `project.json`. The `project.json` declares the targets the plugin infers from those files, so nx-lifecycle wires them. Each dependency's version comes from your pnpm catalog or another package when either has it. Otherwise it is the version the plugin was published with. `nx sync` adds the package to the root `tsconfig.json`.

## 4. Verify

```sh
pnpm nx run-many -t verify
```

This formats with Biome, builds with SWC, and typechecks with `tsc`. It then lints with ESLint and runs the test under c8, which fails below 100% coverage. Run it again and the builds, lint and tests come from the cache.

pnpm warns that eslint-plugin-react and eslint-plugin-jsx-a11y want an older ESLint. Neither has declared ESLint 10 yet, but both run on it.

## Next

**Publish a package.** Pass `--published`, with the fields npm shows:

```sh
pnpm nx g @leyman/nx-plugin:package packages/my-app --description "Uses my-lib." --published --repository https://github.com/owner/repo --author Me --license MIT
```

A published package takes the tsconfig of its Node.js support floor (`--floor`, a version, 22.12.0 by default: the oldest mocha and vitest start on) and gets a `check-package` target. That target packs the package and checks it as npm would get it. Add a `LICENSE` at the root first, and the generator copies it into each published package. To pass the same options every time, set them once in `nx.json`:

```json
{
  "generators": {
    "@leyman/nx-plugin": {
      "package": { "repository": "https://github.com/owner/repo", "author": "Me", "license": "MIT" }
    }
  }
}
```

**Depend on another package.** Add it as a workspace dependency:

```sh
pnpm --filter my-app add my-lib@workspace:^
```

The dependency then needs `"sync-injected": {}` in its `project.json`. That target keeps a dependent's injected copy current after each build. nx-lifecycle fails, naming the project, until it is declared. Then run `pnpm nx sync` and `verify` again.

**Take the rest.** The devcontainer, CI on Dagger, releases and the full set of agent skills are [tier 4](/framework/adoption#_4-devcontainer-ci-and-skills): files you copy rather than install.

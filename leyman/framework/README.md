<div style="text-align:center">

# @leyman/framework

Audits how much of the leyman framework a repository has adopted, tier by tier, with the fix for each gap.

[![npm package](https://badge.fury.io/js/@leyman%2Fframework.svg)](https://www.npmjs.com/package/@leyman/framework)
[![License](https://img.shields.io/npm/l/@leyman/framework.svg)](https://github.com/JacobLey/leyman/blob/main/leyman/framework/LICENSE)

</div>

- **Measures against the tiers**: runs one set of checks for each of the four [adoption tiers](https://jacobley.github.io/leyman/framework/adoption) (checks, shared configs, the Nx plugin and lifecycle, and the devcontainer, CI and skills), and reports the highest tier the repository meets.
- **Every failure comes with its fix**: what failed, where, and what to do about it.
- **Works at any tier**: reads the repository's files and needs nothing installed, so it audits a repository that has adopted nothing yet.
- **An agent brief for the rest**: a skill for the judgment calls no script can make (package design, READMEs, comments, tests and versions), against the [principles](https://jacobley.github.io/leyman/framework/principles).

## Contents

- [Install](#install)
- [Example](#example)
- [CLI](#cli)
- [Checks](#checks)
- [The agent audit](#the-agent-audit)
- [API](#api)

## Install

Run it without installing:

```sh
pnpm dlx @leyman/framework audit
```

Or install it, to fail CI below a tier:

```sh
pnpm add -D @leyman/framework
```

ESM only, Node.js 22 or newer.

## Example

```text
$ pnpm dlx @leyman/framework audit
Audit of /home/me/my-workspace

Tier 1: Checks
  ✓ Each TypeScript package lints with @leyman/eslint-config
  ✓ Each public TypeScript package runs check-package
  ✓ The framework packages installed are their latest versions
...
Tier 4: Devcontainer, CI and skills
  ✗ A devcontainer defines the toolchain
      No .devcontainer/devcontainer.json
    Fix: Copy the devcontainer with the fork manifest: see https://jacobley.github.io/leyman/framework/adoption#_4-devcontainer-ci-and-skills
...
Meets tier 3: Nx plugin and lifecycle.
```

## CLI

```sh
leyman-framework audit [--cwd <root>] [--offline] [--tier <1-4>]
```

| Option      | Default | Description                                                      |
| ----------- | ------- | ---------------------------------------------------------------- |
| `--cwd`     | `.`     | Root of the repository: the directory with its `package.json`.   |
| `--offline` | `false` | Skip the versions check, the only one that reads npm's registry. |
| `--tier`    | —       | Exit with 1 unless the repository meets this tier.               |

Without `--tier` it exits with 0 whatever it finds, so the report is for reading.

## Checks

A tier is met when every check of it, and of each tier before it, passes. A skipped check doesn't hold its tier back.

| Tier | Check           | Passes when                                                                                                                                                                                         |
| ---- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `eslint-config` | Each package with a `tsconfig.json` has an `eslint.config.js`, its own or the root's, that uses `@leyman/eslint-config`.                                                                            |
| 1    | `check-package` | Each public package with a `tsconfig.json` runs `check-package`: a `check-package` target in its `project.json`, or a script.                                                                       |
| 1    | `versions`      | Each of the framework's packages installed, at the root or in a package, is its `latest` version on npm.                                                                                            |
| 2    | `tsconfig`      | Each package's `tsconfig.json` extends `@leyman/configs`, which the package installs. A published package with an `engines.node` floor extends that floor's `tsconfig.node-<major>.json`.           |
| 2    | `biome`         | The root `biome.json` extends `@leyman/configs/biome.base.json`.                                                                                                                                    |
| 2    | `coverage`      | No `.c8rc`, `package.json` `c8` or `@leyman/nx-plugin` `coverage` option lowers a threshold below 100% or turns `check-coverage` off.                                                               |
| 3    | `nx-plugin`     | `nx.json` has the `@leyman/nx-plugin` plugin, or a project runs its targets executor.                                                                                                               |
| 3    | `lifecycle`     | `nx.json` has the `nx-lifecycle/plugin` plugin, or a project has a `lifecycle.json` for its executor.                                                                                               |
| 3    | `inject`        | `pnpm-workspace.yaml` sets `injectWorkspacePackages: true` and `dedupeInjectedDeps: false`.                                                                                                         |
| 3    | `project-json`  | Each package declares targets in its `project.json`.                                                                                                                                                |
| 4    | `devcontainer`  | `.devcontainer/devcontainer.json` exists.                                                                                                                                                           |
| 4    | `images-pinned` | Each image a `.devcontainer` Dockerfile or Compose file uses is pinned by `@sha256:` digest, after `ARG` defaults are substituted.                                                                  |
| 4    | `ci`            | There is a Dagger module and a GitHub Actions workflow.                                                                                                                                             |
| 4    | `workarounds`   | Each patch, override, package extension and peer rule in `pnpm-workspace.yaml` has a comment, above it or above the run of entries it belongs to. None are in `package.json`, which can't hold one. |
| 4    | `agents`        | `AGENTS.md` exists, `CLAUDE.md` is a link to it, `.agents/skills` has a skill, and `.claude/skills` is a link to `../.agents/skills`.                                                               |

The packages are those `pnpm-workspace.yaml` (or `package.json` `workspaces`) lists, or the root package in a repository of one.

## The agent audit

The package ships a skill, `skills/framework-audit/SKILL.md`, for a coding agent to run in the repository. It starts with this CLI, then checks what needs judgment against the principles, and reports each finding with the principle it misses. The CLI prints the skill's path. Copy it into your agent's skills (`.agents/skills/framework-audit/`), or point the agent at it.

## API

```ts
import { audit, formatReport } from '@leyman/framework';

const report = await audit({ cwd: '/path/to/repo' });
if (report.tier < 2) {
    console.log(formatReport(report, 'skills/framework-audit/SKILL.md'));
}
```

### `audit(options?)`

Runs every check, and resolves to an `AuditReport`: the `root` audited, the `tier` met (`0` to `4`), and `checks`, each with its `id`, `tier`, `title`, `fix`, `problems` (empty when it passes) and `skipped` (why it didn't run, if it didn't). Rejects when the root has no `package.json`.

| Option          | Default            | Description                                                                                                       |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `cwd`           | `process.cwd()`    | Root of the repository.                                                                                           |
| `latestVersion` | `npmLatestVersion` | `(name) => Promise<string \| undefined>`: a package's `latest` version, for the versions check. `false` skips it. |

### `formatReport(report, skill)`

The report as the CLI prints it, with `skill` as the path of the agent audit brief.

### `npmLatestVersion(name)`

Reads a package's `latest` version from npm's registry, or `undefined` when npm has none. Rejects when the registry can't be reached.

### `frameworkPackages`, `tierNames`

The packages the versions check compares with npm, and each tier's name.

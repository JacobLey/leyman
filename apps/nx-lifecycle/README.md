<div style="text-align:center">

# nx-lifecycle
An [Nx](https://nx.dev/) plugin that injects specific targets into high level workflows.

[![npm package](https://badge.fury.io/js/nx-lifecycle.svg)](https://www.npmjs.com/package/nx-lifecycle)
[![License](https://img.shields.io/npm/l/nx-lifecycle.svg)](https://github.com/JacobLey/leyman/blob/main/tools/nx-lifecycle/LICENSE)

</div>

## Contents

- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
    - [stages](#stages)
    - [bindings](#bindings)
    - [check](#check)
    - [dryRun](#dryrun)
- [Executors](#executors)
- [CLI](#cli)

For the problem this solves and design rationale, see [WHY-NX-LIFECYCLE.md](./WHY-NX-LIFECYCLE.md).

## Install

```sh
npm i nx-lifecycle
```

Register it as a target in a `project.json`. Because `lifecycle` manages dependencies for the rest of your targets, it should live in a project outside your normal build/test graph — for example, a root-level management package. See [Nx-lifecycle's own monorepo config](https://github.com/JacobLey/leyman/blob/main/leyman/main/lifecycle.json) for a real example.

```json
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "cwd": "{projectRoot}",
                "configFile": "lifecycle.json"
            }
        }
    }
}
```

## Usage

`nx-lifecycle` reads your stage and binding configuration, then writes `dependsOn` entries into `nx.json` and all relevant `project.json` files. The generated targets use the [noop](https://nx.dev/nx-api/nx/executors/noop) executor and should never be invoked directly or have their configuration edited by hand. Commit the generated output to version control.

You may declare any of your own targets as depending on a lifecycle-managed target. That is the intended use: your targets reference abstract stage targets, and `nx-lifecycle` ensures those stages wire up to the correct concrete implementations.

Configuration can be provided in two ways:

- **Inline** — pass `stages` and `bindings` directly in the executor `options` inside `project.json`
- **Config file** — point the executor at a separate JSON file (defaults to `lifecycle.json` in the project root)

```json
// project.json — inline config
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "stages": {
                    "build": {
                        "hooks": ["pre", "run", "post"],
                        "dependsOn": ["^build"]
                    },
                    "test": {
                        "hooks": ["run", "report"],
                        "dependsOn": ["build"]
                    }
                },
                "bindings": {
                    "tsc": "build:run",
                    "mocha": "test:run"
                }
            }
        }
    }
}
```

```json
// project.json — file-based config
{
    "targets": {
        "lifecycle": {
            "executor": "nx-lifecycle:lifecycle",
            "options": {
                "cwd": "{projectRoot}",
                "configFile": "my-lifecycle-config.json"
            }
        }
    }
}
```

```json
// lifecycle.json — the config file
{
    "stages": {
        "build": {
            "hooks": ["pre", "run", "post"],
            "dependsOn": ["^build"]
        },
        "test": {
            "hooks": ["run", "report"],
            "dependsOn": ["build"]
        }
    },
    "bindings": {
        "tsc": "build:run",
        "mocha": "test:run"
    }
}
```

## Configuration

### `stages`

Required. No default.

Declares the abstract workflow stages that `nx-lifecycle` will own. Each key is a stage name; the value configures that stage's structure and upstream dependencies.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `hooks` | `string[]` | — | Ordered list of sub-steps within the stage. The resulting target names are `stage:hook` (e.g. `build:run`). If omitted, the stage has no sub-steps and is referenced directly by name. |
| `dependsOn` | `dependsOn[]` | — | Upstream dependencies for this stage, using the same format as Nx's native [`dependsOn`](https://nx.dev/reference/project-configuration#dependson). Defines the relationship between this stage and others (or their upstream counterparts). |

**Note:** If a stage declares `hooks`, bindings must reference a specific hook (`build:run`), not the stage name alone (`build`).

```json
{
    "stages": {
        "build": {
            "hooks": ["pre", "run", "post"],
            "dependsOn": ["^build"]
        },
        "test": {
            "hooks": ["run", "report"],
            "dependsOn": ["build"]
        }
    }
}
```

A stage without hooks (referenced directly by name):

```json
{
    "stages": {
        "build": {
            "dependsOn": ["^build"]
        }
    },
    "bindings": {
        "tsc": "build"
    }
}
```

### `bindings`

Required. No default.

Maps your project's concrete target names to lifecycle stage hooks. Each key is the name of an existing Nx target (e.g. `tsc`, `mocha`); the value is the stage or stage hook it should be bound to.

```json
{
    "bindings": {
        "tsc": "build:run",
        "mocha": "test:run"
    }
}
```

Multiple targets from different languages or toolchains can bind to the same hook:

```json
{
    "bindings": {
        "tsc": "build:run",
        "gradle": "build:run"
    }
}
```

### `check`

| Type | Default |
|------|---------|
| `boolean` | `true` in CI, `false` otherwise |

When `true`, the executor fails if `nx.json` or any `project.json` is out of sync with what `nx-lifecycle` would generate. Use this in CI to verify that generated configs are committed and up to date before deployment proceeds.

### `dryRun`

| Type | Default |
|------|---------|
| `boolean` | `false` |

When `true`, performs all computation but skips writing any files. Can still fail when `check` is `true`.

## Executors

### `nx-lifecycle:lifecycle`

Reads the stage and binding configuration, then updates `nx.json` and all `project.json` files with the correct `dependsOn` entries for every lifecycle-managed target. Bound project targets gain the appropriate dependencies automatically.

Run this executor whenever you add, remove, or rename targets in your projects to keep all `dependsOn` declarations in sync.

## CLI

`nx-lifecycle` can also be invoked directly as a CLI command. Configuration must be provided via a config file — inline options are not supported from the CLI.

```sh
pnpx nx-lifecycle --help
pnpx nx-lifecycle --config-file ./my-lifecycle.json --dry-run
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--config-file` | `string` | `lifecycle.json` | Path to the lifecycle config file. |
| `--dry-run` | `boolean` | `false` | Compute changes without writing files. |
| `--check` | `boolean` | `true` in CI | Fail if any file is out of sync. |

---
description: The nx-lifecycle command line, to run the executor's sync and explain a project's stages.
---

# CLI

The package installs an `nx-lifecycle` command, also available as `lifecycle`.

Every command takes `--cwd`, the directory other paths are resolved from (default `.`).

## `nx-lifecycle`

The default command. Writes lifecycle targets into `nx.json` and every `project.json`, like the [executor](/packages/nx-lifecycle/guides/executor). Configuration comes from a config file; it can't be passed inline.

```sh
npx nx-lifecycle --config-file ./my-lifecycle.json --dry-run
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--config-file` | `string` | `lifecycle.json` | Config file with `stages` and `bindings`. |
| `--check`, `--ci` | `boolean` | `true` in CI | Write nothing, and fail if any file is out of date. |
| `--dry-run` | `boolean` | `false` | Write nothing. |

## `explain`

Prints what runs, in which order, for the stages of a project: each stage after the stages it depends on, its hooks, and the bound targets the project declares. A `^` dependency lists the upstream projects it runs.

```sh
npx nx-lifecycle explain <project> [stage]
```

```sh
npx nx-lifecycle explain my-lib       # every stage
npx nx-lifecycle explain my-lib test  # test, and the stages it runs after
```

```
my-lib

1. build
   after: ^build (my-utils)
   build:pre (nothing bound)
   build:run
     tsc

2. test
   after: build
   test:run
     mocha
     e2e-test (also after: my-server:build)
   test:report
     coverage-report
```

| Argument | Description |
|----------|-------------|
| `project` | Required. Name of the Nx project. |
| `stage` | Only this stage, and the stages it runs after. |
| `--config-file` | Config file, used when `nx.json` doesn't register the plugin. Default `lifecycle.json`. |

Stages and bindings come from the plugin options in `nx.json`, or else from `--config-file`. Bound targets and their other dependencies come from the project as Nx resolves it, after `targetDefaults` and `project.json`.

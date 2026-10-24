---
description: Install the nx-lifecycle plugin, declare stages and bindings, and run a stage.
---

# Getting started

## Install

Install nx-lifecycle in the workspace root `package.json`, where Nx resolves plugins:

::: code-group

```sh [npm]
npm i -D nx-lifecycle
```

```sh [pnpm]
pnpm add -D nx-lifecycle
```

```sh [yarn]
yarn add -D nx-lifecycle
```

:::

::: tip
nx-lifecycle requires Node.js 24 or later.
:::

## Register the plugin

Add the plugin to `nx.json`, with your [stages](/packages/nx-lifecycle/guides/stages-and-hooks) and bindings as its options:

```json
// nx.json
{
    "plugins": [
        {
            "plugin": "nx-lifecycle/plugin",
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
    ]
}
```

- `stages` declares the workflow. `build` waits for the `build` of the project's dependencies (`^build`), and runs its hooks in order. `test` waits for the project's own `build`.
- `bindings` puts concrete targets into a hook: `tsc` runs in `build:run`, and `mocha` in `test:run`.

## Declare the targets

Define the bound targets as usual. Their implementation can live in `nx.json` `targetDefaults`:

```json
// nx.json
{
    "targetDefaults": {
        "tsc": {
            "executor": "nx:run-commands",
            "options": { "command": "tsc", "cwd": "{projectRoot}" }
        },
        "mocha": {
            "executor": "nx:run-commands",
            "options": { "command": "mocha", "cwd": "{projectRoot}" }
        }
    }
}
```

A project runs a bound target only if its `project.json` declares it:

```json
// libs/my-lib/project.json
{
    "name": "my-lib",
    "targets": {
        "tsc": {},
        "mocha": {}
    }
}
```

A Go project could declare `go-build` instead, bound to the same `build:run`, and still answer to `build`.

Don't add `dependsOn` to the bound targets, or define `build`, `test` and their hooks yourself: the plugin infers them. If a bound target needs another dependency, see [Overriding inferred targets](/packages/nx-lifecycle/guides/overriding-targets).

## Run a stage

```sh
nx run my-lib:test
```

Nx builds `my-lib`'s dependencies, then runs `tsc`, then `mocha`. To see the inferred targets:

```sh
nx show project my-lib
```

Or print the stages in the order they run, with what is bound to each:

```sh
npx nx-lifecycle explain my-lib
```

```
my-lib

1. build
   after: ^build (my-utils)
   build:pre (nothing bound)
   build:run
     tsc
   build:post (nothing bound)

2. test
   after: build
   test:run
     mocha
   test:report (nothing bound)
```

## Add a step

To format generated code after compiling, bind it to `build:post`, and declare it in the projects that need it. The stages stay the same:

```json
// nx.json
{
    "plugins": [
        {
            "plugin": "nx-lifecycle/plugin",
            "options": {
                "bindings": {
                    "tsc": "build:run",
                    "format-output": "build:post",
                    "mocha": "test:run"
                }
            }
        }
    ]
}
```

`format-output` now runs after `tsc`, and `mocha` after `format-output`, in every project that declares it. Nothing else changes.

## Next steps

- [Stages and hooks](/packages/nx-lifecycle/guides/stages-and-hooks): the targets each stage generates, and how stages depend on each other.
- [Overriding inferred targets](/packages/nx-lifecycle/guides/overriding-targets): extra dependencies for one project's bound target.
- [Configuration reference](/packages/nx-lifecycle/reference/configuration): every option.

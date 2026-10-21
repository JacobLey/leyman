---
description: Write lifecycle targets into nx.json and project.json with the executor, check them in CI, and migrate to the plugin.
---

# Executor

The [plugin](/nx-lifecycle/getting-started) is recommended: it infers lifecycle targets, so there is nothing to commit. The executor writes the same targets into `nx.json` and every `project.json` instead, to be committed. Use it when:

- The workspace develops nx-lifecycle itself, and can't load a plugin from unbuilt source.
- You want the full `dependsOn` of every target visible in the files.

Both take the same [stages](/nx-lifecycle/reference/configuration#stages) and [bindings](/nx-lifecycle/reference/configuration#bindings).

## Set up

Register the executor as a target. It rewrites the configuration of every other project, so give it a project outside your build and test graph, like a root-level tooling project:

```json
// tools/workspace/project.json
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

```json
// tools/workspace/lifecycle.json
{
    "$schema": "../../node_modules/nx-lifecycle/out/schema.json",
    "stages": {
        "build": { "hooks": ["pre", "run", "post"], "dependsOn": ["^build"] },
        "test": { "hooks": ["run", "report"], "dependsOn": ["build"] }
    },
    "bindings": {
        "tsc": "build:run",
        "mocha": "test:run"
    }
}
```

`configFile` defaults to `lifecycle.json`, resolved from `cwd`. Instead of a file, `stages` and `bindings` can be passed directly in `options`.

Run it, and commit the result:

```sh
nx run workspace:lifecycle
```

Rerun it whenever stages or bindings change, or a project adds or removes a bound target.

## What it writes

- **`nx.json`**: Each lifecycle target in `targetDefaults`, using the `nx:noop` executor and an empty `__lifecycle` configuration that marks it as generated. Each bound target's `targetDefaults` entry gets its lifecycle dependency appended to its `dependsOn`.
- **`project.json`**: An empty entry for each lifecycle target (`"build:run": {}`), and the lifecycle dependency appended to the `dependsOn` of each bound target that has one.

Don't edit generated targets by hand: the next run replaces them. A target of your own with the same name as a lifecycle target fails the run instead of being replaced: one in `targetDefaults` without the `__lifecycle` configuration, or one in `project.json` with an `executor` or `command`. Lifecycle targets that are no longer configured are removed, along with any `dependsOn` entries on them. Your own entries in a bound target's `dependsOn` are kept, before the lifecycle dependency:

```json
// project.json
{
    "targets": {
        "e2e-test": {
            "dependsOn": [{ "target": "build", "projects": ["my-server"] }, "test:_"]
        }
    }
}
```

## Check in CI

With `check`, the executor writes nothing, and fails if any file is out of date. It is on by default in CI (detected with [ci-info](https://www.npmjs.com/package/ci-info)), so running the same target in CI verifies the committed files.

`dryRun` computes everything without writing, but doesn't fail.

## Migrate to the plugin

1. Add the plugin to `nx.json`, with the stages and bindings of the executor.
2. Remove the `lifecycle` target that runs the executor.
3. In `nx.json` `targetDefaults`, delete every target with a `__lifecycle` configuration, and remove lifecycle targets from the `dependsOn` of bound targets. Delete `dependsOn` if nothing else is left in it, as an empty list replaces the inferred one.
4. Optionally delete the lifecycle targets (`"build:_": {}`…) from each `project.json`. They are empty, so they don't override anything.
5. Run `nx show projects`. The plugin reports any target that still overrides its wiring.

---
description: Every option of the nx-lifecycle plugin and executor.
---

# Configuration

The plugin and executor take the same `stages` and `bindings`. The plugin's options are typed as `LifecyclePluginOptions`, exported from `nx-lifecycle/plugin`:

```ts
import type { LifecyclePluginOptions } from 'nx-lifecycle/plugin';

export const options = {
    stages: {
        build: { hooks: ['pre', 'run', 'post'], dependsOn: ['^build'] },
        test: { hooks: ['run', 'report'], dependsOn: ['build'] },
    },
    bindings: {
        tsc: 'build:run',
        mocha: 'test:run',
    },
} satisfies LifecyclePluginOptions;
```

A JSON Schema for the executor's config file is published at `nx-lifecycle/out/schema.json`, for editor completion with `"$schema"`.

## `stages`

Required. Stages by name.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `hooks` | `string[]` | `[]` | Steps inside the stage, in order. Each becomes a `stage:hook` target, like `build:run`. Without hooks, targets are bound to the stage itself. |
| `dependsOn` | `dependsOn[]` | `[]` | What the stage runs after, in Nx's [`dependsOn`](https://nx.dev/reference/project-configuration#dependson) format. Can't name another stage's anchor or hooks. |

See [Stages and hooks](/packages/nx-lifecycle/guides/stages-and-hooks) for the targets each stage generates.

## `bindings`

Required. Maps target names to the hook they run in, as `stage:hook`, or `stage` for a stage without hooks.

```json
{
    "bindings": {
        "tsc": "build:run",
        "gradle": "build:run",
        "eslint": "lint"
    }
}
```

A binding applies to every project whose `project.json` declares the target, e.g. `"tsc": {}`. Its implementation can come from `targetDefaults`. Any number of targets can be bound to the same hook.

## `check`

Executor only. `boolean`, `true` in CI and `false` otherwise.

Writes nothing, and fails if `nx.json` or any `project.json` is out of date.

## `dryRun`

Executor only. `boolean`, `false` by default.

Computes everything, but writes nothing. Still fails when `check` is `true`.

## Executor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `configFile` | `string` | `lifecycle.json` | Config file with `stages` and `bindings`, resolved from `cwd`. Used when they aren't passed directly. |
| `cwd` | `string` | the current directory (the workspace root, under Nx) | Directory `configFile` is resolved from. |
| `stages`, `bindings` | | | Passed directly, instead of `configFile`. |
| `check`, `dryRun` | `boolean` | | As above. Can also be set in the config file. |

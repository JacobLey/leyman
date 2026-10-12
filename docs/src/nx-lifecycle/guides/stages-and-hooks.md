---
description: The targets each lifecycle stage generates, how bound targets are wired into them, and how stages depend on each other.
---

# Stages and hooks

A **stage** is a step of your workflow, like `build` or `test`. Its **hooks** are the steps inside it, in order. **Bindings** put your concrete targets into a hook.

## Generated targets

Each stage generates a chain of [`nx:noop`](https://nx.dev/nx-api/nx/executors/noop) targets. For `build` with hooks `pre`, `run` and `post`:

```
build:_ → build:pre → build:run → build:post → build
```

- **`build:_`** is the stage's anchor. It carries the stage's `dependsOn`, so every hook waits for it. Nothing can be bound to it.
- **`build:pre`, `build:run`, `build:post`** are the hooks. Each runs after the one before it, and after every target bound to it.
- **`build`** is the stage's entry point. It runs after the last hook. Other stages, and your own targets, should depend on it rather than on its hooks.

A bound target depends on the hook before its own, and its hook depends on it. With `tsc` and `swc` both bound to `build:run`:

```
build:pre → tsc ─┐
build:pre → swc ─┴→ build:run
```

Targets bound to the same hook run in parallel. A hook with nothing bound to it passes straight through, so hooks cost nothing in projects that don't use them.

Every project with a `project.json` gets every stage's targets, even if it declares nothing bound to them, so `nx run-many -t build` reaches every project.

## Stages without hooks

A stage without `hooks` is a single step. Bind targets to the stage itself:

```json
{
    "stages": {
        "lint": { "dependsOn": ["build"] }
    },
    "bindings": {
        "eslint": "lint"
    }
}
```

It still generates an anchor, so the targets are `lint:_ → eslint → lint`.

If a stage has hooks, bind to a hook (`build:run`), not to the stage (`build`).

## Dependencies between stages

A stage's `dependsOn` takes the same entries as Nx's [`dependsOn`](https://nx.dev/reference/project-configuration#dependson):

| Entry | Meaning |
|-------|---------|
| `"build"` | This project's `build` stage. |
| `"^build"` | The `build` stage of every project this one depends on. |
| `{ "target": "build", "projects": ["my-server"] }` | `build` of specific projects. |
| `{ "target": "build", "params": "forward" }` | Forward command line arguments to `build`. |

A stage can depend on another stage, or on any other target, but not on another stage's anchor or hooks: depend on `build`, not `build:post`. Depending on a hook would run part of a stage, so nx-lifecycle rejects it and suggests the stage instead.

A real workflow can have a stage for setup before building, and one to run every check:

```ts
import type { LifecyclePluginOptions } from 'nx-lifecycle/plugin';

export const options = {
    stages: {
        prepare: { hooks: ['generate', 'format'], dependsOn: ['^build'] },
        build: { hooks: ['run', 'post'], dependsOn: ['^build', 'prepare'] },
        lint: { dependsOn: ['prepare', 'build'] },
        test: { hooks: ['compile', 'run', 'report'], dependsOn: ['build'] },
        verify: { dependsOn: ['lint', 'test'] },
    },
    bindings: {
        barrelify: 'prepare:generate',
        biome: 'prepare:format',
        tsc: 'build:run',
        eslint: 'lint',
        'tsc-test': 'test:compile',
        mocha: 'test:run',
        'coverage-report': 'test:report',
    },
} satisfies LifecyclePluginOptions;
```

`verify` binds nothing. It exists to depend on the other stages, so `nx run-many -t verify` runs everything.

## Errors

nx-lifecycle checks the stages and bindings whenever Nx builds the project graph, and fails when:

| Problem | Example |
|---------|---------|
| A binding names a hook that doesn't exist | `"tsc": "build:compile"`, with no `compile` hook |
| A binding names a stage that has hooks | `"tsc": "build"`, when `build` has hooks |
| A binding names an anchor | `"tsc": "build:_"` |
| A bound target has the name of a lifecycle target | `"build:run": "test:run"` |
| A stage depends on another stage's anchor or hook | `"dependsOn": ["^build:post"]` |

A bound target that no project declares is a warning, not an error, since it is usually a typo. Targets created by other Nx plugins aren't declared in `project.json`, so they trigger it too.

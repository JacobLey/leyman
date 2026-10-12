---
description: Nx plugin that derives every dependsOn from declared lifecycle stages (build, test, …) and the targets bound to them.
---

# nx-lifecycle

An [Nx](https://nx.dev/) plugin that derives every `dependsOn` from lifecycle stages you declare once, and the targets you bind to them.

Declare your workflow (`build` runs hooks `pre` → `run` → `post`, and `test` runs after `build`), then bind tools to hooks (`tsc` to `build:run`, `mocha` to `test:run`):

```json
// nx.json
{
    "plugins": [
        {
            "plugin": "nx-lifecycle/plugin",
            "options": {
                "stages": {
                    "build": { "hooks": ["pre", "run", "post"], "dependsOn": ["^build"] },
                    "test": { "hooks": ["run", "report"], "dependsOn": ["build"] }
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

Then `nx run <project>:build` runs the right steps, in the right order, in any project.

**[Get started →](/nx-lifecycle/getting-started)** · [Why nx-lifecycle?](/nx-lifecycle/why)

## Features

- **Add a step in one place**: Binding a new target, like codegen, lint or a post-build step, rewires every target that depends on its stage, in every project.
- **Per-project implementations**: Each project opts into the bound targets it declares, so TypeScript, Go and Java projects can all answer to the same `build` and `test`.
- **Nothing to commit**: The plugin infers targets when Nx builds the project graph, and fails with the fix if a project's `dependsOn` breaks the wiring. An [executor](/nx-lifecycle/guides/executor) that writes the targets to files is also available.
- **See what runs**: [`nx-lifecycle explain`](/nx-lifecycle/reference/cli#explain) prints a project's stages in the order they run, with what is bound to each.

## Compared to

With hand-written `dependsOn` in `targetDefaults` and each `project.json`, adding a step between two existing ones means editing every target that depended on the first, in every project that has it. With nx-lifecycle, it is one binding.

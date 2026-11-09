---
description: Nx plugin that derives every dependsOn from declared lifecycle stages (build, test, …) and the targets bound to them.
---

# nx-lifecycle

<ProjectHeader />

Nx orders targets with each one's `dependsOn`, and written by hand, adding a step in the middle means editing every target that came after it, in every project.

nx-lifecycle is an [Nx](https://nx.dev/) plugin that works out those `dependsOn` for you. You declare the stages of your workflow once (`build` runs hooks `pre`, `run` and `post`, and `test` runs after `build`), then bind your targets to those hooks (`tsc` to `build:run`, `mocha` to `test:run`):

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

Then `nx run <project>:build` runs whatever building means for that project, in the right order.

**[Get started →](/packages/nx-lifecycle/getting-started)** · [Why nx-lifecycle?](/packages/nx-lifecycle/why)

## Features

- Adding a step, like codegen, lint or a post-build step, is one new binding, and every target that depends on its stage is rewired in every project.
- Each project only gets the bound targets it declares, so TypeScript, Go and Java projects can all share the same `build` and `test`.
- The plugin infers targets when Nx builds the project graph, so there is nothing to commit. If a project's `dependsOn` breaks the wiring, it fails and says what to add. An [executor](/packages/nx-lifecycle/guides/executor) that writes the targets to files is also available.
- [`nx-lifecycle explain`](/packages/nx-lifecycle/reference/cli#explain) prints a project's stages in the order they run, with what is bound to each.

## Compared to

With hand-written `dependsOn` in `targetDefaults` and each `project.json`, adding a step between two existing ones means editing every target that depended on the first, in every project that has it. With nx-lifecycle, it is one binding.

## Related

<ProjectRelated />

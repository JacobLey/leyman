---
description: Why hand-written dependsOn doesn't scale in an Nx monorepo, and how lifecycle stages fix it.
---

# Why nx-lifecycle?

## The problem

Nx's `dependsOn` lets a target wait for other targets. To set it correctly you need to know about every other target, including your dependencies' targets, and as a monorepo grows that gets unwieldy.

### Hand-written `dependsOn` doesn't scale

Take a TypeScript build (`tsc`) followed by a test runner (`mocha`):

```json
{
    "targets": {
        "tsc": {
            "dependsOn": ["^tsc"]
        },
        "mocha": {
            "dependsOn": ["tsc"]
        }
    }
}
```

`mocha` waits for `tsc`, and `tsc` waits for its upstream projects to build first.

Now add a post-build step, say [`populate-files`](/packages/populate-files/) generating a JSON config from the compiled JavaScript. It must run after `tsc` but before `mocha`. So `mocha` now has to depend on `populate-files` instead of `tsc`, and `tsc` has to depend on the `populate-files` of _its_ dependencies, but only in the projects that have that step.

Adding one target meant changing two existing ones, depending on what each upstream project implements. With dozens of projects and targets, every new step means more of these changes.

### It gets worse as the repo grows

- Projects implement targets differently (TypeScript, Java, Go).
- Some projects have `populate-files`, others don't.
- A new `lint`, `typecheck` or `codegen` step in one project means auditing every other project's `dependsOn`.
- There is no single place that shows the intended order of operations, since it is spread across every `project.json`.

The `dependsOn` fields end up describing how each project happens to be built, and the order you meant is hard to see in them.

## The solution

nx-lifecycle splits the configuration into two parts.

[Stages](/packages/nx-lifecycle/guides/stages-and-hooks) declare the workflow once, such as `build` with hooks `pre`, `run` and `post`, then `test` with hooks `run` and `report`. They state the intended order, independent of any tool.

Bindings declare once which concrete targets (`tsc`, `eslint`) run in which hook, and each project opts in by declaring those targets. Each binding is written once, next to the tool, instead of in every target that depends on it.

From those, every `dependsOn` is derived. The [plugin](/packages/nx-lifecycle/getting-started) infers them when Nx builds the project graph, or the [executor](/packages/nx-lifecycle/guides/executor) writes them into `nx.json` and `project.json`.

Adding a step means adding one binding, and every `dependsOn` after it is recomputed. With the plugin there is nothing to keep in sync. With the executor the generated files are committed, and CI checks they are up to date.

Then `nx run <project>:build` runs whatever building means for that project.

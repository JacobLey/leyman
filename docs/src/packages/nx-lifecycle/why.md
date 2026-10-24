---
description: Why hand-written dependsOn doesn't scale in an Nx monorepo, and how lifecycle stages fix it.
---

# Why nx-lifecycle?

## The problem

Nx's `dependsOn` lets a target wait for other targets. As a monorepo grows, maintaining it by hand becomes a burden.

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

Now add a post-build step, say [`populate-files`](/packages/populate-files/) generating a JSON config from the compiled JavaScript. It must run after `tsc` but before `mocha`. So:

- `mocha` must now depend on `populate-files`, not `tsc`.
- `tsc` must now depend on the upstream `populate-files` of _its_ dependencies, but only in projects that have that step.

One new target meant changing two existing ones, depending on what each upstream project implements. With dozens of projects and targets, every new step multiplies the changes.

### It compounds

- Projects implement targets differently: TypeScript, Java, Go.
- Some projects have `populate-files`, others don't.
- A new `lint`, `typecheck` or `codegen` step in one project means auditing every other project's `dependsOn`.
- There is no single place that states the intended order of operations. It is spread across every `project.json`.

`dependsOn` becomes a web of implementation details, rather than a statement of intent.

## The solution

nx-lifecycle separates _what_ runs from _how_:

1. **[Stages](/packages/nx-lifecycle/guides/stages-and-hooks)** declare the workflow once: `build` with hooks `pre`, `run` and `post`, then `test` with hooks `run` and `report`. They state the intended order, independent of any tool.
2. **Bindings** declare once which concrete targets (`tsc`, `eslint`) run in which hook. Each project opts in by declaring those targets. The mapping lives with the tool, not in every target that depends on it.
3. **Wiring** is derived. The [plugin](/packages/nx-lifecycle/getting-started) infers every `dependsOn` when Nx builds the project graph, or the [executor](/packages/nx-lifecycle/guides/executor) writes them into `nx.json` and `project.json`.

Adding a step means adding one binding, and every `dependsOn` downstream of it is recomputed. With the plugin there is nothing to keep in sync. With the executor the generated files are committed, and CI checks they are up to date.

Then `nx run <project>:build` runs whatever building means for that project.

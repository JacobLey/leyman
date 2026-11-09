<div style="text-align:center">

# Why nx-lifecycle?

</div>

## The Problem

Nx's `dependsOn` field lets you declare that a target must wait for other targets to complete before it runs. To set it correctly, though, you need to know about every other target, including those of your dependencies, and you have to update the dependents whenever you add a step. As a monorepo grows, that gets unwieldy.

### Manual `dependsOn` doesn't scale

Consider a simple setup: a TypeScript build step (`tsc`) followed by a unit test runner (`mocha`).

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

This is fine. `mocha` waits for `tsc`, and `tsc` waits for its upstream dependencies to build first.

Now you need to add a post-build step, perhaps a [`populate-files`](https://www.npmjs.com/package/load-populate-files) step that uses the freshly-compiled JS to generate a JSON config.

The new step must run after `tsc` but before `mocha`. So `mocha` now has to depend on `populate-files` instead of `tsc`. And `tsc` now has to depend on the `populate-files` of _its_ dependencies, but only in the packages that actually have that step.

Instead of just adding the new target, you had to update the dependencies of two existing ones, and which ones depends on what each upstream package implements. In a monorepo with dozens of packages and targets, every new step means more of these edits.

### The compounding problem

It gets worse as the repo grows:

- Different packages implement targets differently (TypeScript vs Java vs Go)
- Some packages have `populate-files`, others don't
- A new `lint`, `typecheck`, or `codegen` step in one package requires auditing every other package's `dependsOn` to see what needs updating
- There is no single place that shows the _intended_ order of operations, since it's spread across every `project.json`

The `dependsOn` fields end up describing how each package happens to be built, and the order you meant is hard to see in them.

---

## The Solution

`nx-lifecycle` solves this by splitting the configuration into two parts.

First, you declare abstract, high-level workflows once, called stages. For example, `build` has the hooks `pre`, `run` and `post`, and `test` has `run` and `report`. The stages state the _intended_ order of operations, independent of any specific tool, and not every project has to implement every step.

Then you declare once which concrete targets (`tsc`, `eslint`) are bound to which stage and hook. Each project opts in by defining those targets. If your monorepo has Java projects too, you might bind a Gradle target to `build:run` alongside `tsc`. Each binding is written once, next to the tool, instead of in every target that depends on it.

From the stages and bindings, `nx-lifecycle` derives every `dependsOn`. Its Nx plugin infers them when Nx builds the project graph, or its executor writes them into `nx.json` and `project.json`.

Adding a new step then means adding one binding, and every `dependsOn` after it is recomputed. With the plugin this happens every time Nx builds the project graph, so there is nothing to keep in sync. With the executor the generated configs are committed, and CI checks they are up to date.

Now `nx run <project>:build` runs whatever "building" means for each project.

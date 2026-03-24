<div style="text-align:center">

# Why nx-lifecycle?

</div>

## The Problem

Nx's `dependsOn` field is powerful — it lets you declare that a target must wait for other targets to complete before it runs. But as a monorepo grows, managing those dependencies by hand becomes a significant maintenance burden.

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

Now you need to add a post-build step — say, a [`populate-files`](https://www.npmjs.com/package/load-populate-files) step that uses the freshly-compiled JS to generate a JSON config.

The new step must run after `tsc` but before `mocha`. So:

- `mocha` must now depend on `populate-files`, not `tsc`
- `tsc` must now depend on the upstream `populate-files` of _its_ dependencies (but only for packages that actually have that step)

Adding one new target required updating the dependency declarations on two existing targets — and conditionally, depending on what each dependency package implements. In a monorepo with dozens of packages and targets, every new step multiplies the update surface.

### The compounding problem

The situation gets worse as the repo grows:

- Different packages implement targets differently (TypeScript vs Java vs Go)
- Some packages have `populate-files`, others don't
- A new `lint`, `typecheck`, or `codegen` step in one package requires auditing every other package's `dependsOn` to see what needs updating
- There is no single place to reason about the _intended_ order of operations — it's spread across every `project.json`

The `dependsOn` fields become a tangled web of implementation details rather than a clear expression of intent.

---

## The Solution

`nx-lifecycle` separates the _what_ from the _how_:

1. **Stages** — You declare abstract, high-level workflows once (e.g. `build` with hooks `pre`, `run`, `post`; `test` with hooks `run`, `report`). These stages express the _intended_ order of operations, independent of any specific tooling.

2. **Bindings** — Each package declares which concrete targets (e.g. `tsc`, `eslint`) map to which stage and hook. The mapping lives with the tool, not scattered across every dependent.

3. **Generation** — `nx-lifecycle` reads the stages and bindings, then writes all the `dependsOn` fields into `nx.json` and `project.json` automatically.

The result: adding a new step means updating one binding. Every downstream `dependsOn` is recomputed. The generated configs are checked into version control, so CI can verify they're in sync before any deployment proceeds.

Now you can just run `nx run <project>:build` and let the projects determine what "building" means to it.

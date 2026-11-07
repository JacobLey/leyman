---
name: nx-lifecycle
description: How a workspace using nx-lifecycle orders its Nx targets (stages, hooks and bindings), how to see what runs, and how to add, move or override a target without breaking the wiring
---

# nx-lifecycle

`nx-lifecycle` derives every `dependsOn` from declared **stages** and the **targets bound** to their hooks. Order is never written target by target: a stage (`build`) has hooks (`build:pre`, `build:run`...) that run in order, after the stages it depends on, and a work target (`tsc`) is bound to one hook. Reference: the package's [README](https://github.com/JacobLey/leyman/blob/main/apps/nx-lifecycle/README.md).

## Where the configuration is

- **Plugin** (the usual setup): the `nx-lifecycle/plugin` entry in `nx.json` `plugins`, with `stages` and `bindings` as its options. Targets are inferred when Nx builds the project graph; nothing is written to files.
- **Executor**: a `lifecycle` target running `nx-lifecycle:lifecycle`, with the stages and bindings inline or in a `lifecycle.json`. It writes the stage targets and their `dependsOn` into `nx.json` and each `project.json`, which are committed and fail CI when stale.

## Seeing what runs

```sh
nx-lifecycle explain <project>          # each stage, its hooks and the bound targets the project declares, in order
nx-lifecycle explain <project> <stage>  # one stage and those it runs after
nx show project <project>               # every target, inferred ones included
```

## Adding a work target

1. Define it, usually in `nx.json` `targetDefaults` (its command, inputs and outputs).
2. Bind it to a hook in `bindings` (plugin options or `lifecycle.json`). Prefer an existing hook; add a hook to a stage when a target must run between two others.
3. Declare it in the `project.json` of each project that runs it, as `"<target>": {}` at least. A project only runs the bound targets it declares, so this is never automatic.
4. With the executor, run the `lifecycle` target to regenerate the `dependsOn`.

## Rules

- Never define or edit the stage targets (`build`, `build:_`, `build:run`...) by hand, or invoke a hook target directly: run the stage.
- Order targets with stages and hooks, never with a hand-written `dependsOn` between work targets.
- A `dependsOn` in `targetDefaults` or `project.json` replaces the inferred one. A bound target that needs its own (another project's build, say) must also list its lifecycle dependency: the hook before its own, or `<stage>:_` for a stage's first hook. The plugin fails with the entry to add when one is missing.
- The plugin only wires projects with a `project.json`, and a target another plugin creates only once that `project.json` declares it.

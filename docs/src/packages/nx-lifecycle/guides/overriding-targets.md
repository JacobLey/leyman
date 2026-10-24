---
description: Add dependencies to one project's bound target, and what the plugin can't wire.
---

# Overriding inferred targets

Nx applies `nx.json` `targetDefaults` and `project.json` on top of the targets a plugin infers. A `dependsOn` there **replaces** the inferred one, rather than merging with it. So:

- Don't define the stage targets (`build`, `build:_`, `build:run`…) yourself.
- If a bound target sets its own `dependsOn`, include its lifecycle dependency: the hook before its own, or `<stage>:_` for the first hook.

## Extra dependencies for a bound target

Say `e2e-test` is bound to `test:run`, and needs `my-server` built first. Its lifecycle dependency is the hook before `test:run`. With hooks `run` and `report`, that is the anchor, `test:_`:

```json
// apps/my-app/project.json
{
    "targets": {
        "e2e-test": {
            "dependsOn": [{ "target": "build", "projects": ["my-server"] }, "test:_"]
        }
    }
}
```

If you leave out `test:_`, `e2e-test` would run before `build`. nx-lifecycle checks the merged configuration of every project when Nx builds the project graph, and fails with the entry to add:

```
nx-lifecycle targets are not wired as configured:
- e2e-test is bound to test:run, so it must depend on test:_. A dependsOn in project.json or nx.json targetDefaults replaces the inferred one, so add "test:_" to it
  Projects: my-app
```

The same problem in many projects is reported once, since it usually comes from `targetDefaults`.

Use this sparingly. If many projects need the same dependency, it belongs in the stage.

[`nx-lifecycle explain`](/packages/nx-lifecycle/reference/cli#explain) shows extra dependencies next to the target:

```
2. test
   after: build
   test:run
     e2e-test (also after: my-server:build)
```

## Limitations

- Only projects with a `project.json` get lifecycle targets. Projects inferred from `package.json` alone don't.
- A target created by another Nx plugin is only wired if it is also declared in `project.json`, e.g. `"vite:build": {}`.
- Nx must load the plugin before it can build anything, so a workspace can't use the plugin from its own unbuilt source. Depend on a published version, or use the [executor](/packages/nx-lifecycle/guides/executor).

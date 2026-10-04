---
"nx-lifecycle": minor
---

Add an Nx plugin, `nx-lifecycle/plugin`, that infers lifecycle targets when Nx builds the project graph instead of writing them to `nx.json` and `project.json`. It checks the merged configuration, and fails if `targetDefaults` or `project.json` replace a bound target's lifecycle dependency.

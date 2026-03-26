---
name: lifecycle
description: Understanding implementation of nx-lifecycle and targets
---

# Lifecycle Configuration

This directory's `../lifecycle.json` is the single source of truth for how every task in this monorepo is ordered and connected. It is managed by [`nx-lifecycle`](../../../../apps/nx-lifecycle/README.md) and generates all `dependsOn` entries in `nx.json` and every `project.json`.

For why this approach exists at all, see [WHY-NX-LIFECYCLE.md](../../../../apps/nx-lifecycle/WHY-NX-LIFECYCLE.md).

---

There are 4 main orchestration targets:

* Install 
  * Makes sure dependencies are installed and linked.
* Check
  * Linters and formatting
  * `format` intentionally runs after `lint`, in case fixers have changed code structure that doesn't match formatting rules.
  * Highly recommend implementing `no-check` configs for implementations, to allow steps like `build` to run in a dev mode without abiding by strict linter rules.
* Build
  * Do all necessary codegen
  * `pre` targets should do any work that requires editing the actual source code (e.g. `barrelify`) or resetting the output (to avoid conflicts with previous runs).
  * `run` targets should be the main work to populate a `/dist` that will actually get published/executed.
  * `post` targets should perform any additional codegen that relies on the `/dist` (e.g. exporting JSON schemas to `/out` via `populate-files`)
* Test
  * run test suite with coverage
  * `reset` should clear any reporting from previous runs.
  * `run` should do the actual testing. Multiple test suites can be executed if necessary (e.g. a unit test AND an integration test)
  * 

_Currently_ this repo is entirely typescript, so all implementations are for typescript packages, but that could change in the future, and is explicitly supported.

See how those are wired up to implementations in the `lifecycle.json` itself, and tasks can be better understood via [nx-tasks-reference](../../../../.claude/skills/nx-tasks-reference/SKILL.md)

## Modifying the lifecycle

**To add a new work target** (e.g. a new codegen step):

1. Add the target to `targetDefaults` in `nx.json`
2. Add a binding in `lifecycle.json` mapping the target name to the appropriate stage hook
3. Run `nx run @leyman/main:lifecycle` to regenerate all `dependsOn` entries
4. Add to `project.json` for all projects that will use it (does not get added implicitly)
5. Update [documentation](../../../../.claude/skills/nx-tasks-reference/SKILL.md) about task
6. Commit the generated changes

Avoid editing `dependsOn` by hand in `nx.json` or any `project.json`. `nx-lifecycle` will make sure the orchestrator dependencies are maintained, but in general this is a sign that the dependencies should be reflected in the top level targets (which might require creating more sub-targets).

---

## The `coverage-report` exception

`coverage-report` is intentionally **not** bound to the `test` lifecycle. It validates the 100% coverage threshold after all test data has been collected, and must run as a separate `nx run-many -t coverage-report` pass. The `test-ci` script runs both in sequence.

Binding it inside `test` would mean coverage thresholds are enforced on every incremental test run, which is unhelpful during development. Keeping it separate lets `nx run-many -t test` run fast and iteratively, while CI enforces coverage as a final gate.

# Running Nx Tasks

> General Nx CLI reference: https://nx.dev/docs/reference/nx-commands#nx-run
> Workspace task definitions: [`../../nx.json`](../../nx.json)

## How to Run Tasks

```bash
# Single project, single target
nx run <project>:<target>

# All projects
nx run-many -t <target>

# Specific projects
nx run-many -t <target> -p <project1> <project2>

# Only projects affected by current changes (vs main branch)
nx affected -t <target>
```

## Task Ordering

Tasks are broken down into high level goals (checking, building, testing...)

See [this explanation](../../leyman/main/lifecycle/AGENTS.md) for why/how that is maintained.

Just select the high level task to focus on and execute it. Dependent tasks will run, but Nx caching should make those very fast.

Note that it is difficult to run a single task (even with `--excludeTaskDependencies`). For example trying to re-run the tests, without re-running the build step won't actually reflect the recent code changes in the tests.

## Useful Flags

```bash
-c fix                     # Short for --configuration=fix auto-fixes lint and format issues
--skipNxCache              # Bypass cache and rerun
--verbose                  # Stack traces and extra output
--nxBail                   # Stop after first failure
--tuiAutoExit              # Exit TUI automatically when done (used in scripts)
nx affected --base=main    # Explicit base for affected calculation
```

## Common Command Shortcuts

These are linked to the /scripts/commands directory (via PATH)

```bash
test-ci       # Full CI: test + coverage enforcement
test-only     # Tests only, skip lint/format
test-and-fix  # Run full CI target with auto-fix
dagger-test   # Run full CI pipeline in Dagger container
```

## Finding Available Targets

See enabled targets in `project.json`, and cross reference against [nx.json`](../../nx.json) and [lifecycle.json](../../leyman/main/lifecycle.json) to exclude the orchestration tasks.
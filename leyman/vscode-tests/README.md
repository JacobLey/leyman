# vscode-tests

Run and debug a single test from VS Code: a play button next to each test and suite, and in the Testing panel.

## Using it

The first time a window opens a worktree, build the package, then install the workspace extension when VS Code recommends it (or open the Extensions view, find **Leyman tests** under Recommended, and choose **Install Workspace Extension**):

```bash
nx run @leyman/vscode-tests:build
```

Then reload the window. The extension is in [`.vscode/extensions/leyman-tests`](../../.vscode/extensions/leyman-tests), and only loads this package's build from its own worktree, so every worktree runs its own code. After changing this package, build it and reload the window.

A button:

1. Builds with the project's `test:compile` target, as tests run from compiled output. A type error stops the run here, and shows in the test output.
2. Runs Mocha or Vitest directly on that spec, selecting by title. This skips coverage and Nx's cache, so a test always runs.
3. Puts results back on the tests, with diffs and the failing line.

**Debug** does the same under the debugger, with timeouts off.

## What it finds

Tests come from the syntax of each `*.spec.ts`, without running it. Any `test`, `it`, `suite` or `describe` call with a literal title counts, whatever it is called on, so `withTmpDir.test('...', ...)` has a button.

A title only known at runtime can't be selected on its own: run its enclosing suite or file, and it appears in the list with its result. The same goes for a failing hook.

Go and Rust tests have their own buttons, from their language extensions.

## Private for now

This only works in this repo: it assumes its Nx targets, compiled test layout and tool paths. If there is a need elsewhere, re-investigate making it reusable. VS Code extensions aren't installed from npm, so that means turning those assumptions into settings, bundling a `.vsix`, and publishing to the VS Code Marketplace and Open VSX.

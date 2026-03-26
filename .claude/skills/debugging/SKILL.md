---
name: debugging
description: Debugging (source maps, cache, test failures)
---

# Debugging

> Reference: [`../../../nx.json`](../../../nx.json) · [Node.js debugging](https://nodejs.org/en/learn/getting-started/debugging)

## Source Maps

Source maps are enabled everywhere. Set `NODE_OPTIONS=--enable-source-maps` to get TypeScript stack traces from compiled JS:

```bash
NODE_OPTIONS=--enable-source-maps node ./dist/index.js
```

The `mocha-unit-test` and `mocha-integration-test` targets already set this automatically.

## Nx Cache Issues

If a target seems to return stale results, bypass the cache:

```bash
nx run <project>:<target> --skipNxCache
```

Clear the entire local cache:
```bash
nx reset
```

## Verbose Output

```bash
nx run <project>:<target> --verbose   # show stack traces and detailed logs
```

## Inspecting Target Configuration

Always use `nx show project` to see the actual resolved config — some targets are inferred by plugins and won't appear in `project.json`:

```bash
nx show project <project> --json
nx show project <project> --json | jq '.targets.<target>'
```

## Debugging Test Failures

Run a single test file directly (skip Nx overhead):
```bash
cd <project-dir>
NODE_OPTIONS=--enable-source-maps mocha './dist/tests/unit/my.spec.js'
```

Run with a filter to target specific tests:
```bash
mocha './dist/tests/unit/**/*.spec.js' --grep "my test name"
```

## Debugging Build Failures

1. Check TypeScript errors: `nx run <project>:typecheck`
2. Check lint: `nx run <project>:check:lint`
3. Check format: `nx run <project>:check:format`
4. Check barrel files are in sync: `barrel --ci` (from project dir)

## Coverage Debugging

Coverage reports are at `.coverage/project/<name>/report/index.html`. Open in a browser to see which lines/branches are uncovered.

To rerun coverage without clearing existing data:
```bash
nx run <project>:mocha-unit-test --skipNxCache
nx run <project>:mocha-integration-test --skipNxCache
nx run <project>:coverage-report
```

## Dependency Graph

Visualize the full dependency graph to understand task ordering:
```bash
nx graph                          # open in browser
nx graph --file=graph.json        # export to JSON
nx affected:graph                 # show only affected projects
```

## ESLint Cache

ESLint caches results in `.eslintcache`. If you see stale lint results:
```bash
nx run <project>:eslint --skipNxCache
```

## DevContainer

This repo is designed for use in the [DevContainer](../../../.devcontainer/). Outside it, tools like Node, PNPM, Dagger, and global binaries may not be on PATH as expected.

If a command is not found, check:
1. Are you in the DevContainer?
2. Is `leyman/main/node_modules/.bin` on your PATH? (it should be automatically via PNPM workspace setup)

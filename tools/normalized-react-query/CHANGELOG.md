# normalized-react-query

## 2.0.0

### Major Changes

- 6600e37: Complete refactor to be more based around tanstack query fundamentals, inspired by Relay
- eaae490: Increase node engine requirement

### Minor Changes

- a87031f: Deprecate `fetchQuery`, `ensureQueryData`, `fetchInfiniteQuery` and `ensureInfiniteQueryData`, following React Query. Use `.query()` / `.infiniteQuery()`, with `{ staleTime: 'static', awaitLinks: true }` in place of the ensure methods.
- 4f218d6: Add `.query()` and `.infiniteQuery()`, mirroring `queryClient.query` and `queryClient.infiniteQuery`. They accept a `select` applied after propagation, and `awaitLinks` to wait for linked queries. `prefetchQuery` and `prefetchInfiniteQuery` also accept `awaitLinks`.
- 6233481: Update dependencies: @tanstack/react-query@5.104.0
  
  Load data with `queryClient.query` and `queryClient.infiniteQuery`, which replace the deprecated `fetchQuery`, `ensureQueryData` and their infinite counterparts. Requires `@tanstack/react-query` 5.104 or later.

### Patch Changes

- 712d034: Fix propagate typing
- e9be601: Fix `ensureQueryData` and `ensureInfiniteQueryData` not waiting for linked queries after the first call on the same query client
- 2ae16b8: Update READMEs to be more agent friendly

## 1.0.10

### Patch Changes

- 9694f33: Bump dependencies

## 1.0.9

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin

## 1.0.8

### Patch Changes

- 568a84d: Bump dependencies

## 1.0.7

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- efd163f: Remove local files from publishing
- fc8beb5: Remove outdated eslint rule ignores
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies

## 1.0.6

### Patch Changes

- e718f38: Update dependencies

## 1.0.5

### Patch Changes

- bcd9e61: Bump dependencies
- 1387a8c: Bump sonarjs eslint and fix/ignore issues

## 1.0.4

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 7d6f471: Add support for type-only exports to barrels
- 9b58c82: Bump typescript version

## 1.0.3

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 1.0.2

### Patch Changes

- 3dc29d2: Update JSDoc
- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies

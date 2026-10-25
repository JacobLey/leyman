# normalized-react-query

## 2.1.1

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- b7f43d7: `Linked` is exported as a type.
- f4053c3: Document the required peer dependencies in the install line, that `Linked` is not exported by name, `link()` options (`isolateErrors`) and its error, and what hook `select` receives.

## 2.1.0

### Minor Changes

- f93f56c: A `useNormalizedPrefetched*` hook throws when it is given a link on a different query client than the one it first rendered with (e.g. one that started without a link and has no `QueryClientProvider`). TanStack keeps a hook on its first client, so it used to read a separate cache: refetching the link's data and missing updates to it. `react` (`^18 || ^19`, as TanStack requires) is now a declared peer dependency.

### Patch Changes

- f286bea: A linked query that fails no longer causes an unhandled promise rejection when nothing waits for it: in hooks, or in `query()` without `awaitLinks`. Its error is still in the linked query's state. Hooks also no longer keep every link they create for the life of the query client.

## 2.0.1

### Patch Changes

- aed2e55: Document the suspense and prefetch infinite hooks (`useNormalizedSuspenseInfiniteQuery`, `useNormalizedNullableSuspenseInfiniteQuery`, `useNormalizedPrefetchInfiniteQuery`, `useNormalizedPrefetchedSuspenseInfiniteQuery`, `useNormalizedNullablePrefetchedSuspenseInfiniteQuery`) and the `getParams`, `Infinite#getQueryFn` and `Infinite#getInfiniteQueryData` methods in the README.
- 7604ec7: Fix hooks that render without a link (or with `skipToken`) before they get one. Tanstack hooks stay on the client they first render with, so these hooks never read the link's client and kept rendering placeholder data (or, for the nullable suspense hooks, suspended forever when params were later skipped). Disabled hooks now render with the context client.
  
  Stop cancelling in-flight queries whose last observer unmounts (e.g. every query under `StrictMode`). The query context was spread to add `params`, which reads `signal` and tells Tanstack the query can be aborted.
- bd095c3: Fix `useNormalizedPrefetchedSuspenseQuery` reading from the context client instead of the link's client. It required a `QueryClientProvider`, and a link from another client suspended and refetched into the provider's cache, while its own links loaded into the link's client.
- 15f5262: Fix README links that were broken on npm: relative links (such as WHY files and sibling packages) are now absolute, table-of-contents anchors match their headings, LICENSE badges point at the right path, and `repository` now names the package's directory in the monorepo.
- ac478a2: Make the package easier to find and evaluate: a clearer npm description and keywords, and a README that opens with highlights and how it compares to alternatives.

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

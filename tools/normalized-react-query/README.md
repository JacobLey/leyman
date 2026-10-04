<div style="text-align:center">

# normalized-react-query
Type-safe query definitions for TanStack Query — define each key and fetcher once, and link related queries so they prefetch together.

[![npm package](https://badge.fury.io/js/normalized-react-query.svg)](https://www.npmjs.com/package/normalized-react-query)
[![License](https://img.shields.io/npm/l/normalized-react-query.svg)](https://github.com/JacobLey/leyman/blob/main/tools/normalized-react-query/LICENSE)

</div>

- **One definition per query** — `resource()` pairs a key with its fetcher, so the same key can never serve different data and the same data is never fetched under two keys.
- **Typed by params** — call sites pass `{ id: 123 }`, not a hand-built key array; reads, writes and invalidation (`setQueryData`, `invalidateQuery`, …) are typed to the resource's data.
- **Linked queries, no waterfalls** — `.propagate()` declares the queries a result leads to (a book's author, every user on a list page), which start prefetching the moment the parent loads.
- **SSR in one call** — `.query(client, params, { awaitLinks: true })` loads a query and everything it links to, ready to dehydrate.
- **Every hook flavour** — plain, suspense, nullable (`skipToken`), infinite and prefetched variants of TanStack's hooks.

**Compared to**

- TanStack's own [`queryOptions`](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) — also pairs a key with its fetcher, but per call site; there are no params-typed cache helpers or linked prefetching.
- [@lukemorales/query-key-factory](https://www.npmjs.com/package/@lukemorales/query-key-factory) — organizes keys (and optionally fetchers) into a typed tree; it does not link queries or wrap the hooks.

For the full motivation, see [WHY-NORMALIZED-REACT-QUERY.md](https://github.com/JacobLey/leyman/blob/main/tools/normalized-react-query/WHY-NORMALIZED-REACT-QUERY.md).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [resource](#resourceparams)
  - [infinite](#infiniteparams)
  - [Hooks](#hooks)
  - [Linked](#linked)
- [Types](#types)
  - [QueryData](#querydatat)
  - [QueryParams](#queryparamst)
  - [QueryKey](#querykeyt)
  - [LinkOf](#linkoft)
- [Also See](#also-see)

## Install

```sh
npm i normalized-react-query
```

## Example

```ts
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
    resource,
    infinite,
    useNormalizedQuery,
    useNormalizedInfiniteQuery,
    type QueryData,
    type QueryParams,
} from 'normalized-react-query';
import { getUser, listUsers } from './api/users.js';

// Define a resource once — key and queryFn are always paired together.
const fetchUser = resource<{ id: number }, User>({
    key: ({ id }) => ['users', 'get', id],
    queryFn: ({ params: { id } }) => getUser(id),
});

// Whenever a page of users loads, prefetch each user's detail query.
const listUsersInfinite = infinite<void, User[], number>({
    key: ['users', 'list'],
    getInitialPageParam: 0,
    getNextPageParam: ({ lastPage, lastPageParam }) =>
        lastPage.length ? lastPageParam + 1 : undefined,
    queryFn: ({ pageParam }) => listUsers(pageParam),
}).propagate(({ page }) =>
    page.map(user => ({
        ...user,
        detail: fetchUser.link({ id: user.id }),
    }))
);

const useExample = (queryClient: QueryClient) => {
    // All three refer to the same cache entry — no collision, no double-fetch.
    const first = useNormalizedQuery(fetchUser, { id: 123 });
    const second = useNormalizedQuery(fetchUser, { id: 123 }); // served from cache
    const third = useNormalizedQuery(fetchUser, { id: 456 }); // separate entry

    const list = useNormalizedInfiniteQuery(listUsersInfinite, undefined);
};
```

## Usage

`normalized-react-query` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { resource } = await import('normalized-react-query');`.

Both `react` and `@tanstack/react-query` are peer dependencies. This package enforces typing and structure; all caching, revalidation, and subscription logic is handled by React Query.

Instances created by `resource()` and `infinite()` are designed to be singletons — create once, import everywhere. The functional constructors (`resource`, `infinite`) are the primary API. The underlying `Resource` and `Infinite` classes are also exported as types for use in type annotations.

## API

### `resource(params)`

Creates a type-safe, singleton reference to a non-paginated query. The key and query function are defined together and reused at every call site.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.key` | `TQueryKey \| ((params: TParams) => TQueryKey)` | — | Required. A static key or function computing the key from params. |
| `params.queryFn` | `(options: QueryFunctionContextWithParams<TParams, ...>, queryClient?) => Promise<TData> \| TData` | — | Required. The cached query function. Receives params plus standard TanStack context. |

**Returns** `Resource<TParams, TData>` — a resource instance.

#### `Resource` instance methods

All methods that interact with the cache accept `queryClient` as the first argument and `params` as the second.

##### `.getKey(params): TQueryKey`

Returns the computed query key for the given params.

##### `.getQueryFn(params): QueryFn`

Returns the query function bound to the given params, suitable for passing to TanStack directly.

##### `.getUseQueryOptions(queryClient, params | skipToken, options?)`

Returns options ready to spread into `useQuery` or `useQueries`. Supports `skipToken` to disable the query.

##### `.getUseSuspenseQueryOptions(queryClient, params, options?)`

Returns options ready to spread into `useSuspenseQuery` or `useSuspenseQueries`.

##### `.query(queryClient, params, options?): Promise<TData>`

Returns fresh cached data, or fetches it, like `queryClient.query`. Triggers propagation to downstream linked resources, which load in the background. Accepts every `queryClient.query` option besides the key and query function, plus:

- `select`: transforms the propagated data this call resolves with, without affecting the cache.
- `awaitLinks`: also waits for linked resources to load, and rejects if any fail (unless the link sets `isolateErrors`).

To load everything a server-side render needs, pass `{ staleTime: 'static', awaitLinks: true }`: cached data is used as-is, and every link is loaded.

##### `.fetchQuery(queryClient, params, options?): Promise<TData>`

**Deprecated:** use `.query()`. Fetches (or reads from cache) and returns data. Triggers propagation to downstream linked resources.

##### `.prefetchQuery(queryClient, params, options?): Promise<Linked>`

Loads data for someone else to use, like `.query()` but without throwing. Returns a `Linked` reference usable with prefetched hooks.

##### `.ensureQueryData(queryClient, params, options?): Promise<TData>`

**Deprecated:** use `.query()` with `{ staleTime: 'static', awaitLinks: true }`. Returns stale cached data or fetches fresh data. Waits for all downstream propagated links to resolve.

##### `.setQueryData(queryClient, params, updater, options?): TData | undefined`

Sets data directly in the cache. The updater can be a value or a callback receiving the current cached value.

##### `.populate(queryClient, params, updater, options?): TParams`

Calls `setQueryData` and returns the params. Useful for chaining — the returned params can be passed directly to hooks.

##### `.link(params, options?): Linked`

Must be called inside a `propagate` callback. Triggers a prefetch of this resource and returns a `Linked` reference for downstream hooks. Throws if called outside of `propagate`.

##### `.propagate(map): Resource`

Attaches a transformation that runs after the query resolves. Inside `map`, call `.link()` on other resources to trigger downstream prefetches. Returns a new `Resource` with the updated propagated type.

##### `.invalidateQuery(queryClient, params, filters?, options?): Promise<void>`

Invalidates the exact query entry for the given params.

##### `.refetchQuery(queryClient, params, filters?, options?): Promise<void>`

Refetches the exact query entry for the given params.

##### `.cancelQuery(queryClient, params, filters?, options?): Promise<void>`

Cancels the in-flight query for the given params.

##### `.removeQuery(queryClient, params, filters?): void`

Removes the query entry from cache.

##### `.resetQuery(queryClient, params, filters?, options?): Promise<void>`

Resets the query to its initial state.

##### `.getQueryData(queryClient, params): TData | undefined`

Returns cached data without triggering a fetch.

##### `.getQueryState(queryClient, params): QueryState | undefined`

Returns the full TanStack query state object.

##### `.getCachedQuery(queryClient, params, filters?): Query | undefined`

Returns the internal TanStack `Query` instance.

##### `.isFetching(queryClient, params, filters?): boolean`

Returns `true` if a fetch is currently in flight for this exact query.

##### `.hasData(queryClient, params): boolean`

Returns `true` if any data is present in cache (regardless of staleness).

##### `.hasState(queryClient, params): boolean`

Returns `true` if a query state entry exists (whether fetching, stale, or idle).

---

### `infinite(params)`

Creates a type-safe, singleton reference to an infinite (paginated) query, backed by TanStack's infinite queries. Like `resource`, it supports `.propagate()`, so each loaded page can link to other resources.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.key` | `TQueryKey \| ((params: TParams) => TQueryKey)` | — | Required. A static key or function computing the key from params. |
| `params.queryFn` | `(options: QueryFunctionContextWithParams<TParams, TPageParam, ...>, queryClient?) => Promise<TData> \| TData` | — | Required. Called once per page load. |
| `params.getInitialPageParam` | `TPageParam \| ((params: TParams) => TPageParam)` | — | Required. The page param used to fetch the first page. |
| `params.getNextPageParam` | `(params: { lastPage, allPages, lastPageParam, allPageParams }) => TPageParam \| null \| undefined` | — | Required. Returns the next page param, or `null`/`undefined` when there are no more pages. |
| `params.getPreviousPageParam` | `(params: { firstPage, allPages, firstPageParam, allPageParams }) => TPageParam \| null \| undefined` | `undefined` | Optional. Enables backwards pagination. |

**Returns** `Infinite<TParams, TPageParam, TData>` — an infinite instance.

#### `Infinite` instance methods

`Infinite` extends `Queryable` and shares `getKey`, `invalidateQuery`, `refetchQuery`, `cancelQuery`, `removeQuery`, `resetQuery`, `getQueryData`, `getQueryState`, `getCachedQuery`, `isFetching`, `hasData`, and `hasState` with `Resource`.

##### `.getInitialPageParam(params): TPageParam`

Returns the initial page param for the given query params.

##### `.getGetNextPageParam(params): GetNextPageParamFunction`

Returns the `getNextPageParam` callback bound to the given params.

##### `.getGetPreviousPageParam(params): GetPreviousPageParamFunction`

Returns the `getPreviousPageParam` callback bound to the given params.

##### `.getUseInfiniteQueryOptions(queryClient, params | skipToken, options?)`

Returns options ready to spread into `useInfiniteQuery`. Supports `skipToken`.

##### `.getUseSuspenseInfiniteQueryOptions(queryClient, params, options?)`

Returns options ready to spread into `useSuspenseInfiniteQuery`.

##### `.infiniteQuery(queryClient, params, options?): Promise<InfiniteData<TData>>`

Like `.query()`, for every loaded page: wraps `queryClient.infiniteQuery`, and accepts the same `select` and `awaitLinks` options.

##### `.fetchInfiniteQuery(queryClient, params, options?): Promise<InfiniteData<TData>>`

**Deprecated:** use `.infiniteQuery()`. Fetches all loaded pages and triggers propagation.

##### `.prefetchInfiniteQuery(queryClient, params, options?): Promise<Linked>`

Loads data for someone else to use, like `.infiniteQuery()` but without throwing. Returns a `Linked` reference.

##### `.ensureInfiniteQueryData(queryClient, params, options?): Promise<InfiniteData<TData>>`

**Deprecated:** use `.infiniteQuery()` with `{ staleTime: 'static', awaitLinks: true }`. Returns stale or fresh data and waits for all propagated links to resolve.

##### `.setInfiniteQueryData(queryClient, params, updater, options?): InfiniteData<TData> | undefined`

Sets paginated data directly in the cache.

##### `.populate(queryClient, params, updater, options?): TParams`

Calls `setInfiniteQueryData` and returns the params.

##### `.link(params, options?): Linked`

Must be called inside a `propagate` callback. Triggers a prefetch and returns a `Linked` reference. Throws if called outside of `propagate`.

##### `.propagate(map): Infinite`

Attaches a per-page transformation. The `map` callback receives `{ page, pageParam }` and may call `.link()` on other resources. Returns a new `Infinite` with the updated propagated type.

---

### Hooks

All hooks wrap their TanStack counterparts with type-safe resource/infinite instances. The `key` and `queryFn` are derived from the resource — do not pass them manually.

Like TanStack's hooks, each hook stays on the query client it first renders with. The `useNormalizedPrefetched*` hooks read the link's client, and the context client while they have no link (`null` or `skipToken`). A hook that renders without a link first therefore only picks up links on the context client, and needs a `QueryClientProvider` to pick up any link at all.

#### `useNormalizedQuery(res, params | skipToken, options?, queryClient?)`

Wraps `useQuery`. Pass `skipToken` as `params` to disable the query.

#### `useNormalizedSuspenseQuery(res, params, options?, queryClient?)`

Wraps `useSuspenseQuery`.

#### `useNormalizedNullableSuspenseQuery(res, params | skipToken, options?, queryClient?)`

Wraps `useSuspenseQuery` with `skipToken` support. Returns `null` when `skipToken` is passed.

#### `useNormalizedPrefetchQuery(res, params, options?, queryClient?): Linked`

Wraps `usePrefetchQuery`. Triggers a prefetch on first render and returns a `Linked` reference for use with prefetched hooks.

#### `useNormalizedPrefetchedQuery(linked | skipToken | null, options?)`

Wraps `useQuery` for data that has already been prefetched via `prefetchQuery` or `useNormalizedPrefetchQuery`.

#### `useNormalizedPrefetchedSuspenseQuery(linked, options?)`

Wraps `useSuspenseQuery` for prefetched data.

#### `useNormalizedNullablePrefetchedSuspenseQuery(linked | skipToken | null, options?)`

Wraps `useSuspenseQuery` with `skipToken` support for prefetched data. Returns `null` when disabled.

#### `useNormalizedInfiniteQuery(inf, params | skipToken, options?, queryClient?)`

Wraps `useInfiniteQuery`. Pass `skipToken` as `params` to disable.

#### `useNormalizedPrefetchedInfiniteQuery(linked | skipToken | null, options?)`

Wraps `useInfiniteQuery` for prefetched infinite data.

---

### `Linked`

A `Linked<TParams, TQueryKey, TData, TQueryable>` is a reference to a specific query that has been (or is being) prefetched. It is produced by `.prefetchQuery()`, `.prefetchInfiniteQuery()`, `.link()`, and `useNormalizedPrefetchQuery()`.

Pass `Linked` instances to the `useNormalizedPrefetched*` hooks to subscribe to their data.

#### `.getQueryable(): TQueryable`

Returns the resource or infinite instance.

#### `.getParams(): TParams`

Returns the params that were used to prefetch.

#### `.getQueryClient(): QueryClient`

Returns the query client associated with the prefetch.

## Types

### `QueryData<T>`

Extracts the cached data type (`TData`) from a `Resource` or `Infinite` instance type.

```ts
type UserData = QueryData<typeof fetchUser>; // User
```

### `QueryParams<T>`

Extracts the params type from a `Resource` or `Infinite` instance type.

```ts
type UserParams = QueryParams<typeof fetchUser>; // { id: number }
```

### `QueryKey<T>`

Extracts the query key type from a `Resource` or `Infinite` instance type.

### `LinkOf<T>`

Extracts the `Linked` type for a given `Resource` or `Infinite` instance type. Useful for typing function parameters that accept a prefetched reference.

```ts
type UserLink = LinkOf<typeof fetchUser>;
// Linked<{ id: number }, readonly unknown[], User, Resource<...>>
```

## Also See

- [`@tanstack/react-query`](https://tanstack.com/query/latest) — the underlying query library this package wraps
- [WHY-NORMALIZED-REACT-QUERY.md](https://github.com/JacobLey/leyman/blob/main/tools/normalized-react-query/WHY-NORMALIZED-REACT-QUERY.md) — motivation: the key/function pairing problem, and request waterfalls

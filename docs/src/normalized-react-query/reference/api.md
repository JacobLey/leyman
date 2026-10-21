---
description: Every normalized-react-query function, method, hook and type.
---

# API

normalized-react-query is ESM only. From CommonJS, load it with a dynamic import: `const { resource } = await import('normalized-react-query');`. `@tanstack/react-query` is a peer dependency.

Resources and infinite queries are meant to be created once, at module scope, and imported everywhere. `Resource` and `Infinite` are exported as types, for annotations.

## `resource(params)`

Defines a query that isn't paginated.

| Param | Type | Description |
|-------|------|-------------|
| `key` | `TQueryKey \| ((params: TParams) => TQueryKey)` | Required. A fixed key, or one computed from the params. |
| `queryFn` | `(context, queryClient?) => TData \| Promise<TData>` | Required. Loads the data. `context` is TanStack's query function context, plus `params`. |

**Returns** `Resource<TParams, TData>`.

### Resource methods

Every method that uses the cache takes the `QueryClient` first, then the params.

| Method | Description |
|--------|-------------|
| `getKey(params)` | The query key for the params. |
| `getParams(params)` | Returns `params`, checked against the resource's params type. |
| `getQueryFn(params)` | The query function for the params, without propagation, for passing to TanStack directly. |
| `getUseQueryOptions(client, params \| skipToken, options?)` | Options to spread into `useQuery` or `useQueries`. |
| `getUseSuspenseQueryOptions(client, params, options?)` | Options to spread into `useSuspenseQuery` or `useSuspenseQueries`. |
| `query(client, params, options?)` | Returns fresh cached data, or loads it, like `queryClient.query`. Starts loading its links. Also takes `select` (applied to this call's result only) and `awaitLinks` (also waits for every link, and rejects if one fails). |
| `prefetchQuery(client, params, options?)` | Loads data for later, like `query()` but never throws. Returns a [`Linked`](#linked). |
| `setQueryData(client, params, updater, options?)` | Writes data to the cache. `updater` is a value, or a function of the cached value. |
| `populate(client, params, updater, options?)` | `setQueryData()`, then returns the params, e.g. to pass to a hook. |
| `getQueryData(client, params)` | The cached data, without loading it. |
| `getQueryState(client, params)` | TanStack's query state. |
| `getCachedQuery(client, params, filters?)` | TanStack's `Query` instance. |
| `invalidateQuery(client, params, filters?, options?)` | Invalidates this exact query. |
| `refetchQuery(client, params, filters?, options?)` | Refetches this exact query. |
| `cancelQuery(client, params, filters?, options?)` | Cancels this query's request in flight. |
| `removeQuery(client, params, filters?)` | Removes the query from the cache. |
| `resetQuery(client, params, filters?, options?)` | Resets the query to its initial state. |
| `isFetching(client, params, filters?)` | Whether a request for this query is in flight. |
| `hasData(client, params)` | Whether the cache has data for it, stale or not. |
| `hasState(client, params)` | Whether the cache has an entry for it, in any state. |
| `link(params, options?)` | Only inside `propagate`. Starts loading this query, and returns a [`Linked`](#linked). Takes `prefetchQuery` options, plus `isolateErrors`, which keeps its failure from failing a parent loaded with `awaitLinks`. Throws outside `propagate`. |
| `propagate(map)` | A new resource with the same key and cache entry, whose data is `map(data)`. `map` may call `link()`. See [Linked queries](/normalized-react-query/guides/linked-queries). |

`fetchQuery()` and `ensureQueryData()` are deprecated: use `query()`, with `{ staleTime: 'static', awaitLinks: true }` for `ensureQueryData()`.

## `infinite(params)`

Defines a paginated query, backed by TanStack's infinite queries.

| Param | Type | Description |
|-------|------|-------------|
| `key` | `TQueryKey \| ((params: TParams) => TQueryKey)` | Required. A fixed key, or one computed from the params. |
| `queryFn` | `(context, queryClient?) => TData \| Promise<TData>` | Required. Loads one page. `context` also has `params` and `pageParam`. |
| `getInitialPageParam` | `TPageParam \| ((params: TParams) => TPageParam)` | Required. The first page's param. |
| `getNextPageParam` | `({ lastPage, allPages, lastPageParam, allPageParams }) => TPageParam \| null \| undefined` | Required. The next page's param, or `null`/`undefined` when there are no more. |
| `getPreviousPageParam` | `({ firstPage, allPages, firstPageParam, allPageParams }) => TPageParam \| null \| undefined` | Optional. Pages backwards. |

**Returns** `Infinite<TParams, TPageParam, TData>`.

### Infinite methods

Shares `getKey`, `getParams`, `invalidateQuery`, `refetchQuery`, `cancelQuery`, `removeQuery`, `resetQuery`, `getQueryData`, `getQueryState`, `getCachedQuery`, `isFetching`, `hasData`, `hasState`, `link` and `populate` with resources. Its data is TanStack's `InfiniteData`, with every loaded page.

| Method | Description |
|--------|-------------|
| `getInitialPageParam(params)` | The first page's param for the params. |
| `getGetNextPageParam(params)` / `getGetPreviousPageParam(params)` | The page param functions for the params. |
| `getQueryFn(params)` | The page query function for the params, without propagation. |
| `getUseInfiniteQueryOptions(client, params \| skipToken, options?)` | Options to spread into `useInfiniteQuery`. |
| `getUseSuspenseInfiniteQueryOptions(client, params, options?)` | Options to spread into `useSuspenseInfiniteQuery`. |
| `infiniteQuery(client, params, options?)` | Like `query()`, for every loaded page, with the same `select` and `awaitLinks` options. |
| `prefetchInfiniteQuery(client, params, options?)` | Like `infiniteQuery()`, but never throws. Returns a [`Linked`](#linked). |
| `setInfiniteQueryData(client, params, updater, options?)` | Writes every page to the cache. |
| `getInfiniteQueryData(client, params)` | Same as `getQueryData()`. |
| `propagate(map)` | Like a resource's, but `map` runs per page, with `{ page, pageParam }`. |

`fetchInfiniteQuery()` and `ensureInfiniteQueryData()` are deprecated: use `infiniteQuery()`.

## Hooks

Each hook wraps the TanStack hook of the same name, without `normalized`. It takes that hook's options, except `queryKey` and `queryFn` (and the page params, for infinite queries), and its `select` receives the propagated data. Hooks that take a resource also take a `QueryClient` last, overriding the one from context.

| Resource | Infinite | Takes | Returns |
|----------|----------|-------|---------|
| `useNormalizedQuery` | `useNormalizedInfiniteQuery` | params or `skipToken` | TanStack's result |
| `useNormalizedSuspenseQuery` | `useNormalizedSuspenseInfiniteQuery` | params | TanStack's result |
| `useNormalizedNullableSuspenseQuery` | `useNormalizedNullableSuspenseInfiniteQuery` | params or `skipToken` | TanStack's result, or `null` for `skipToken` |
| `useNormalizedPrefetchQuery` | `useNormalizedPrefetchInfiniteQuery` | params | a [`Linked`](#linked), starting a prefetch on first render |
| `useNormalizedPrefetchedQuery` | `useNormalizedPrefetchedInfiniteQuery` | a `Linked`, `skipToken` or `null` | TanStack's result |
| `useNormalizedPrefetchedSuspenseQuery` | `useNormalizedPrefetchedSuspenseInfiniteQuery` | a `Linked` | TanStack's result |
| `useNormalizedNullablePrefetchedSuspenseQuery` | `useNormalizedNullablePrefetchedSuspenseInfiniteQuery` | a `Linked`, `skipToken` or `null` | TanStack's result, or `null` |

Like TanStack's hooks, each hook stays on the query client it first renders with. The `Prefetched` hooks use the link's client, and the context's client while they have no link. One that first renders without a link therefore only accepts links on the context's client (so it needs a `QueryClientProvider`), and throws for a link on any other client, rather than reading a different cache.

## `Linked`

A reference to a query that is loaded, or loading. Made by `link()`, `prefetchQuery()`, `prefetchInfiniteQuery()` and the `Prefetch` hooks, and read by the `Prefetched` hooks.

| Method | Returns |
|--------|---------|
| `getQueryable()` | The resource or infinite query. |
| `getParams()` | The params it was loaded with. |
| `getQueryClient()` | The client it was loaded into. |

## Types

| Type | Description |
|------|-------------|
| `QueryData<typeof res>` | The data a resource or infinite query caches. |
| `QueryParams<typeof res>` | Its params. |
| `QueryKey<typeof res>` | Its key. |
| `LinkOf<typeof res>` | The `Linked` type for it, e.g. for a component prop. |

```ts
interface User {
    id: number;
    name: string;
}
declare const getUser: (id: number) => Promise<User>;
// ---cut---
import { resource, type QueryData, type QueryParams } from 'normalized-react-query';

const users = resource({
    key: ({ id }: { id: number }) => ['users', id],
    queryFn: ({ params }) => getUser(params.id),
});

type UserData = QueryData<typeof users>;
//   ^?
type UserParams = QueryParams<typeof users>;
//   ^?
```

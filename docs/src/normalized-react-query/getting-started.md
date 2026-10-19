---
description: Install normalized-react-query, define a resource, and use it in hooks and cache helpers.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i normalized-react-query @tanstack/react-query
```

```sh [pnpm]
pnpm add normalized-react-query @tanstack/react-query
```

```sh [yarn]
yarn add normalized-react-query @tanstack/react-query
```

:::

::: tip
`@tanstack/react-query` (v5) is a peer dependency, and does all the caching, refetching and subscribing. normalized-react-query is ESM only, and requires Node.js 24 or later for server code.
:::

## Define a resource

A resource pairs a query key with the function that loads it. Define it once, in a module of its own, and import it wherever the data is used:

```ts
interface User {
    id: number;
    name: string;
}
declare const getUser: (id: number) => Promise<User>;
// ---cut---
import { resource } from 'normalized-react-query';

export const users = resource({
    key: ({ id }: { id: number }) => ['users', id],
    queryFn: ({ params }) => getUser(params.id),
});
```

- `key` computes the key from the params. A resource that takes no params can use a fixed key: `key: ['settings']`.
- `queryFn` receives the params, as `params`, along with TanStack's usual context (`signal`, `queryKey`, …).
- The params and data types come from these two functions. You can also give them explicitly: `resource<{ id: number }, User>({ ... })`.

## Use it in a component

Pass the resource and its params to a hook. The key and fetcher come from the resource, and the result is typed:

```ts
interface User {
    id: number;
    name: string;
}
declare const getUser: (id: number) => Promise<User>;
import { resource } from 'normalized-react-query';
const users = resource({
    key: ({ id }: { id: number }) => ['users', id],
    queryFn: ({ params }) => getUser(params.id),
});
// ---cut---
import { skipToken } from '@tanstack/react-query';
import { useNormalizedQuery, useNormalizedSuspenseQuery } from 'normalized-react-query';

export const useUserName = (id: number | null) => {
    // `skipToken` disables the query, as in TanStack
    const { data } = useNormalizedQuery(users, id === null ? skipToken : { id });
    //      ^?
    return data?.name;
};

export const useUser = (id: number) => useNormalizedSuspenseQuery(users, { id }).data;
```

Each hook takes the options of its TanStack counterpart (`staleTime`, `select`, `enabled`, …), except `queryKey` and `queryFn`, and optionally a `QueryClient` as its last argument. See the [hooks reference](/normalized-react-query/reference/api#hooks).

## Use the cache

Every cache operation takes the `QueryClient`, then the params, and is typed to the resource's data:

```ts
interface User {
    id: number;
    name: string;
}
declare const getUser: (id: number) => Promise<User>;
import { resource } from 'normalized-react-query';
const users = resource({
    key: ({ id }: { id: number }) => ['users', id],
    queryFn: ({ params }) => getUser(params.id),
});
// ---cut---
import type { QueryClient } from '@tanstack/react-query';

export const rename = async (client: QueryClient, id: number, name: string) => {
    users.setQueryData(client, { id }, user => user && { ...user, name });
    await users.invalidateQuery(client, { id });
};

export const loadUser = async (client: QueryClient, id: number) => users.query(client, { id });
```

## Next steps

- [Linked queries](/normalized-react-query/guides/linked-queries): start loading related data as soon as its parent loads.
- [Infinite queries](/normalized-react-query/guides/infinite-queries): paginated queries, defined the same way.
- [Server rendering](/normalized-react-query/guides/server-rendering): load everything a page needs before rendering it.
- [API reference](/normalized-react-query/reference/api): every method and hook.

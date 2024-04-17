<div style="text-align:center">

<h1>normalized-react-query</h1>
<p>Wrapper around React Query to enforce type-safe, consistent key-query mappings.</p>

[![npm package](https://badge.fury.io/js/normalized-react-query.svg)](https://www.npmjs.com/package/normalized-react-query)
[![License](https://img.shields.io/npm/l/normalized-react-query.svg)](https://github.com/JacobLey/leyman/blob/main/tools/normalized-react-query/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/normalized-react-query.svg)](https://github.com/JacobLey/leyman/blob/main/tools/normalized-react-query)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

<a name="Introduction"></a>
## Introduction

[React Query](https://tanstack.com/query/v4) provides powerful API state management, with caching, pre-fetching, SSR, and hook support.

The main idea is pairing "keys" (unique to a specific API call + params) with a query function. React Query handles actual pairing of async logic with synchronous hooks/renders behind the scenes.

The "problem" with manual pairing of keys to functions is that there is no way to ensure the exact same function is paired to the same key, or that the same key is re-used for similar queries. As a result, either caching may prevent the desired function from being called, or may accidentally call the same function multiple times.

Take these example hooks, which represent inconsistent usage of keys + query handlers:

```ts
import { useQuery } from '@tanstack/react-query';
import { getUsers } from './api/users.js';

const useExample = () => {
    const firstQuery = useQuery(
        ['users', 'get'],
        async () => {
            return getPosts();
        };
    );

    const secondQuery = useQuery(
        ['users', 'get'],
        async () => {
            // NEVER RUNS
            // Uses cached value of `firstQuery`.
            // Result is typed to include `{ decorate: boolean }` but that will never exist.
            const users = await getUsers();
            return users.map(user => {
                ...user,
                decorate: true,
            };
        };
    );

    const thirdQuery = useQuery(
        // Different key, same API call.
        // Triggers another fetch for data that already exists.
        ['users', 'fetch'],
        async () => {
            return getUsers();
        };
    );
};
```

This package attempts to solve this discrepancy by forcing pairing of keys and functions, with strongly typed data.

Ideally any implementations of the wrapper classes can offload any API and business logic so that actual React functions can simply access the data as it becomes available.

<a name="Install"></a>
## Install

```sh
npm i normalized-react-query
```

<a name="Example"></a>
## Example

```ts
import type { QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import {
    Paginated,
    type QueryData,
    type QueryParams,
    Resource,
} from 'normalized-react-query';
import { getUsers, listUsers } from './api/users.js';

class FetchUser extends Resource<User, UserId> {
    protected getKey(id: QueryParams<this>): QueryKey {
        return ['users', 'get', id];
    }
    protected async queryFn(id: QueryParams<this>): Promise<QueryData<this>> {
        return getUser(id)
    }
}
const fetchUser = new FetchUser();

class ListUsers extends Paginated<User> {
    protected getKey(): QueryKey {
        return ['posts', 'get'];
    }
    protected async queryFn(): Promise<QueryData<this>> {
        return listUsers();
    }
    protected async onSuccess(
        client: QueryClient,
        params: QueryParams<this>,
        data: QueryData<this>
    ): void {
        for (const user of data) {
            // Pre-populate lookup data of users by-id.
            fetchUser.setData(client, user.id, user);
        }
    }
}
const listUsers = new ListUsers();

const useExample = () => {
    const firstQuery = fetchUser.useQuery(123);
    // Successfully cached
    const secondQuery = fetchUser.useQuery(123);
    // Separate query, consistent behavior
    const thirdQuery = fetchUser.useQuery(456);

    // Pre-populates every user
    const listQuery = listUsers.useQuery();

    const [showFourth, setShowFourth] = useState(false);
    useEffect(() => {
        setTimeout(() => setShowFourth(true), 5000);
    });

    // Will be cached immediately on load, due to "listUsers" pre-population.
    const fourthQuery = fetchUser.useQuery(789, {
        // All normal React-Query options are available
        enabled: showFourth,
    });
};
```

<a name="Usage"></a>
## Usage

`normalized-react-query` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { Resource } = await import('normalized-react-query');`.

Both the react and react query modules are required for this package to work. Peer dependencies are declared on both. This package merely enforces typing and structure, any caching/revalidation/subscription is still implemented by native React Query.

Class interfaces are used to best expose inheritance and override functionality for typescript. The actual query instances used should be singletons (e.g. create once and re-use).

A lowercase version of each class is available in favor of functional programming practices.

e.g.
```ts
import { resource, Resource } from 'normalized-react-query';
import { getUser, type User } from './api.js';

class GetUserClass extends Resource<User, string> {
    getKey(id) {
        return ['users', id];
    }
    queryFn(id) {
        return getUser(id);
    }
    onError(client, id, error) {
        console.error(`Failed to lookup user ${id}`, error);
    }
}
const getUserClass = new GetUserClass();

// Logically same as `getUserClass`.
const getUser = resource<User, string>(
    {
        getKey(id) {
            return ['users', id];
        }
        queryFn(id) {
            return getUser(id);
        }
    },
    {
        onError(client, id, error) {
            console.error(`Failed to lookup user ${id}`, error);
        }
    }
);
```

<a name="Api"></a>
## API

## Resource

The `Resource` class is the most basic wrapper around `useQuery`. When in doubt, a method that asynchronously loads data (a "resource") should extend the `Resource` class.

Each child class defines the parameters to the function, and generates a unique `queryKey` for those params. It also provides some basic abstractions to support other React Query functionality such as pre-fetching data and invalidation.

The query function can be as simple as a direct API call, but supports side effects as necessary. A common side effect may be to take a sub-resource of the response, and pre-load another query.

These side-effects should _most likely_ be placed in lifecycle hooks, like `onSuccess`.

## Paginated

The `Paginated` class is a typed extension `Resource`. It provides some default typing to support pagination, which React Query supports natively with [keepPreviousData](https://tanstack.com/query/v4/docs/guides/paginated-queries).

## Infinite

The `Infinite` class wraps the `Paginated` class further, providing "infinite" queries where all pages are loaded and available in parallel. It is built off multiple individual queries, so any refetching, caching, invalidation, and de-duplication is handled smoothy.

### Why not native `useInfinite`?

React Query exports a `useInfinite` natively, which provides _very_ similar behavior out of the box. The decision to not use it is based on that hook conflicting with `useQuery`'s cache. `useInfinite` queries cannot share a `queryKey` with `useQuery`, and therefore cannot benefit from the powerful functionality React Query defines.

Therefore, a custom `useInfinite` hook was implemented using React Query's `useQueries` hook. That ensures any using of `Infinite`s `useQuery` hook can benefit from `useInfinite` and vice versa. Remember `Infinite` is a child class of `Paginated` and therefore supports normal query behavior as well.

## Mutation

The `Mutation` class is a wrapper around [React Query `useMutation`](https://tanstack.com/query/v4/docs/reference/useMutation). "Mutations" aren't fetching data, but rather changing the server state, and handling side effects accordingly.

Most common mutations are POST and PATCH endpoints, that most likely impact a related GET endpoint. Therefore the "side effects" should either set the new state data (if returned from the mutation) or invalidate the existing query and force it to refetch.

Mutations are not "cached" in the same sense `useQuery` is, but do generally benefit from the pattern of consistent mutation handling and typings.

## Types

A few types are exported for convenience of accessing the generic parameters of a resource.

All accept the `this` instance of a child class.

### QueryData

Access the returned data type of `useQuery`.

### QueryParams

Access the parameter data type to `useQuery`.

### QueryVariables

Unique to `Mutation`, access the variables interface provided to mutation execution.

### EmptyObject

Represents `{}` type, with no keys. Can be passed as parameter to `Paginated`/`Infinite` generics when there are no other parameters to provide.

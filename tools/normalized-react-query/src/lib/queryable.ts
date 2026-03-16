import type {
    CancelOptions,
    InvalidateOptions,
    InvalidateQueryFilters,
    Query,
    QueryFilters,
    QueryState,
    RefetchOptions,
    RefetchQueryFilters,
    ResetOptions,
} from '@tanstack/react-query';
import type { OverriddenQueryFilterFields, typeCache } from './types.js';
import { QueryClient } from '@tanstack/react-query';

export const noopSelector = <T>(x: T): T => x;
export const undefinedSelector = (): undefined => {};
export const noopKey = ['__NORMALIZED_REACT_QUERY__', 'SKIP'];
// A "dummy" client for times when we need a hook for consistency, but don't actually want to do anything.
// Create a new client every time to prevent any accidental "caching".
// Will be pre-populated with an "empty object" to prevent suspension, but users should never actually
// be exposed to that
export const getDummyQueryClient = (): QueryClient => {
    const client = new QueryClient({
        defaultOptions: {
            queries: {
                // Prevent any manual GC
                staleTime: Infinity,
            },
        },
    });
    // Populate as if infinite. Required for infinite internals,
    // and ignored for resource.
    client.setQueryData(noopKey, {
        pages: [],
        pageParams: [],
    });
    return client;
};

/**
 * Base class for TanstackQuery "resources" and "infinite" queries.
 *
 * A shared base class makes cross functionality like preloading easier,
 * and also takes over some of the "generic" cache facing functionality (like invalidation)
 * that aren't concerned with actual query implementation.
 *
 * @template TParams - user provided type for query input
 * @template TQueryKey - resulting TanstackQuery key from input
 * @template TData - return type from cache, without propagation
 */
export abstract class Queryable<TParams, TQueryKey extends readonly unknown[], TData> {
    /**
     * Used to access type parameters.
     *
     * __DO NOT USE__
     */
    public declare readonly [typeCache]?: {
        params: TParams;
        key: TQueryKey;
        data: TData;
    };

    readonly #getKey: (params: TParams) => TQueryKey;

    protected constructor(
        option:
            | Queryable<TParams, TQueryKey, TData>
            | {
                  key: TQueryKey | ((params: TParams) => TQueryKey);
              }
    ) {
        if (option instanceof Queryable) {
            this.#getKey = option.#getKey;
        } else {
            const { key } = option;
            this.#getKey = typeof key === 'function' ? key : () => key;
        }
    }

    /**
     * Generate the key for the specific parameters to be passed to various TanstackQuery methods.
     *
     * @param params - user provided params to inject into callback
     * @returns query key
     */
    public getKey(params: TParams): TQueryKey {
        return this.#getKey(params);
    }

    /**
     * Doesn't "do" anything, but ensures that params are in correct format, so that future references
     * can safely access.
     *
     * @param params - user provided params to inject into callback
     * @returns unmodified params
     */
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- uses class type
    public getParams(params: TParams): TParams {
        return params;
    }

    /**
     * Type safe wrapper around invalidating *only* the query defined by the given params.
     *
     * See [invalidateQueries](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientinvalidatequeries)
     * for expected behavior.
     *
     * For non-exact usage, call `invalidateQueries` directly with `queryKey: getKey()`.
     *
     * Does *not* directly impact propagated queries.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     * @param options - invalidation options
     * @returns query is invalidated
     */
    public async invalidateQuery(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<InvalidateQueryFilters<TQueryKey>, OverriddenQueryFilterFields>,
        options?: InvalidateOptions
    ): Promise<void> {
        return queryClient.invalidateQueries(
            {
                ...filters,
                queryKey: this.getKey(params),
                exact: true,
            },
            options
        );
    }

    /**
     * Type safe wrapper around refetching *only* the query defined by the given params.
     *
     * See [refetchQueries](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientrefetchqueries)
     * for expected behavior.
     *
     * For non-exact usage, call `refetchQueries` directly with `queryKey: getKey()`.
     *
     * Does *not* directly impact propagated queries.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     * @param options - refetch config
     * @returns query is refetched
     */
    public async refetchQuery(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<RefetchQueryFilters<TQueryKey>, OverriddenQueryFilterFields>,
        options?: RefetchOptions
    ): Promise<void> {
        return queryClient.refetchQueries(
            {
                ...filters,
                queryKey: this.getKey(params),
                exact: true,
            },
            options
        );
    }

    /**
     * Type safe wrapper around canceling *only* the query defined by the given params.
     *
     * See [cancelQueries](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientcancelqueries)
     * for expected behavior.
     *
     * For non-exact usage, call `cancelQueries` directly with `queryKey: getKey()`.
     *
     * Does *not* directly impact propagated queries.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     * @param options - cancellation options
     * @returns query is cancelled
     */
    public async cancelQuery(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<QueryFilters<TQueryKey>, OverriddenQueryFilterFields>,
        options?: CancelOptions
    ): Promise<void> {
        return queryClient.cancelQueries(
            {
                ...filters,
                queryKey: this.getKey(params),
                exact: true,
            },
            options
        );
    }

    /**
     * Type safe wrapper around removing *only* the query defined by the given params.
     *
     * See [removeQueries](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientremovequeries)
     * for expected behavior.
     *
     * For non-exact usage, call `removeQueries` directly with `queryKey: getKey()`.
     *
     * Does *not* directly impact propagated queries.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     */
    public removeQuery(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<QueryFilters<TQueryKey>, OverriddenQueryFilterFields>
    ): void {
        queryClient.removeQueries({
            ...filters,
            queryKey: this.getKey(params),
            exact: true,
        });
    }

    /**
     * Type safe wrapper around resetting *only* the query defined by the given params.
     *
     * See [resetQueries](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientresetqueries)
     * for expected behavior.
     *
     * For non-exact usage, call `resetQueries` directly with `queryKey: getKey()`.
     *
     * Does *not* directly impact propagated queries.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     * @param options - reset config
     * @returns query is reset
     */
    public async resetQuery(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<QueryFilters<TQueryKey>, OverriddenQueryFilterFields>,
        options?: ResetOptions
    ): Promise<void> {
        return queryClient.resetQueries(
            {
                ...filters,
                queryKey: this.getKey(params),
                exact: true,
            },
            options
        );
    }

    /**
     * Type safe wrapper around checking whether *only* the query defined by the given params is fetching.
     *
     * See [isFetching](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientisfetching)
     * for more details.
     *
     * For non-exact usage, call `isFetching` directly with `queryKey: getKey()`.
     *
     * Does *not* represent propagated queries.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     * @returns query is reset
     */
    public isFetching(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<QueryFilters<TQueryKey>, OverriddenQueryFilterFields>
    ): boolean {
        return (
            queryClient.isFetching({
                ...filters,
                queryKey: this.getKey(params),
                exact: true,
            }) !== 0
        );
    }

    /**
     * Load query data directly from cache if exists.
     * See [Tanstack docs](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientgetquerydata)
     * for better information.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @returns data from cache, if exists
     */
    public getQueryData(queryClient: QueryClient, params: TParams): TData | undefined {
        return queryClient.getQueryData(this.getKey(params));
    }

    /**
     * Expose internal query + cache state of query.
     * See [Tanstack docs](https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientgetquerystate)
     * for better information.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @returns data from cache, if exists
     */
    public getQueryState(
        queryClient: QueryClient,
        params: TParams
    ): QueryState<TData, unknown> | undefined {
        return queryClient.getQueryState(this.getKey(params));
    }

    /**
     * Expose internal query instance.
     * See [Tanstack docs](https://tanstack.com/query/latest/docs/reference/QueryCache#querycachefind)
     * for better information.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param filters - [QueryFilters](https://tanstack.com/query/latest/docs/framework/react/guides/filters#query-filters), minus key + exact
     * @returns data from cache, if exists
     */
    public getCachedQuery(
        queryClient: QueryClient,
        params: TParams,
        filters?: Omit<QueryFilters<TQueryKey>, OverriddenQueryFilterFields>
    ): Query<TData, unknown, TData> | undefined {
        return queryClient.getQueryCache().find({
            ...filters,
            queryKey: this.getKey(params),
            exact: true,
        });
    }

    /**
     * Returns true if query currently has data in cache, regardless of being stale.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @returns data in cache
     */
    public hasData(queryClient: QueryClient, params: TParams): boolean {
        return this.getQueryData(queryClient, params) !== undefined;
    }

    /**
     * Returns true if query exists, whether currently fetching, idle, stale...
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @returns query exists
     */
    public hasState(queryClient: QueryClient, params: TParams): boolean {
        return this.getQueryState(queryClient, params) !== undefined;
    }
}

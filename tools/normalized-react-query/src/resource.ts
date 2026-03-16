import type {
    EnsureQueryDataOptions,
    FetchQueryOptions,
    QueryClient,
    QueryFunctionContext,
    SetDataOptions,
    SkipToken,
    UndefinedInitialDataOptions,
    Updater,
    UseQueryOptions,
    UseQueryResult,
    UseSuspenseQueryOptions,
    UseSuspenseQueryResult,
} from '@tanstack/react-query';
import type {
    LinksActive,
    OverriddenUseQueryFields,
    QueryFunctionContextWithParams,
    typeCache,
} from './lib/types.js';
import { skipToken, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { getLinksActive, Linked, setLinksActive } from './lib/linked.js';
import {
    getDummyQueryClient,
    noopKey,
    noopSelector,
    Queryable,
    undefinedSelector,
} from './lib/queryable.js';

/**
 * Type-safe wrapper around "resources" (non-infinite) in TanstackQuery.
 *
 * Class is not exposed directly to avoid subclassing and constructor overloads.
 * See exported {@link resource} for public interface.
 *
 * @template TParams - user provided params to trigger a query
 * @template TData - return type of base `queryFn`
 * @template TPropagatedData - updated type after "propagate" calls. Impacts return values from various methods, but not the actual value provided/received from cache.
 * @template TQueryKey - type of TanstackQuery key computed that uniquely identifies resource + params
 */
class Resource<
    TParams,
    TData,
    TPropagatedData = TData,
    TQueryKey extends readonly unknown[] = readonly unknown[],
> extends Queryable<TParams, TQueryKey, TData> {
    /**
     * Used to access type parameters.
     *
     * __DO NOT USE__
     */
    public declare readonly [typeCache]?: {
        data: TData;
        params: TParams;
        key: TQueryKey;
        propagated: TPropagatedData;
    };

    readonly #queryFn: (
        options: QueryFunctionContextWithParams<TParams, never, TQueryKey>,
        queryClient?: QueryClient
    ) => Promise<TData> | TData;
    readonly #selectors:
        | readonly [...((x: unknown) => unknown)[], (x: any) => TPropagatedData]
        | [];
    readonly #useSelector = new WeakMap<
        QueryClient,
        WeakMap<(x: TPropagatedData) => unknown, (x: TData) => unknown>
    >();

    public constructor(
        ...options:
            | [
                  {
                      key: TQueryKey | ((params: TParams) => TQueryKey);
                      queryFn: (
                          options: QueryFunctionContextWithParams<TParams, never, TQueryKey>,
                          queryClient?: QueryClient
                      ) => Promise<TData> | TData;
                  },
              ]
            | [Resource<TParams, TData, unknown, TQueryKey>, (x: any) => TPropagatedData]
    ) {
        super(options[0]);
        if (options.length === 1) {
            const [{ queryFn }] = options;
            this.#queryFn = queryFn;
            this.#selectors = [];
        } else {
            const [parent, selector] = options;
            this.#queryFn = parent.#queryFn;
            this.#selectors = [...parent.#selectors, selector];
        }
    }

    /**
     * Returns `queryFn` to pass to TanstackQuery, *without* any propagation.
     *
     * @param params - user provided params to inject into callback
     * @returns main query function
     */
    public getQueryFn(
        params: TParams
    ): (options: QueryFunctionContext<TQueryKey>, queryClient?: QueryClient) => Promise<TData> {
        return async options => this.#queryFn({ ...options, params });
    }

    /**
     * Object with type-safe properties to use resource's query.
     * Applies a `select` (which can be merged with user provided `select`) to propagate+link
     * downstream resources.
     *
     * Produces output that is safe to pass to `useQueries` (i.e. supports `skipToken`).
     * Can be merge output with additional options accepted by `useQueries`.
     *
     * If you do not need to support "disabling", this is interchangeable with {@link getUseSuspenseQueryOptions}.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Additional user-provided `select` field to do additional transformations after propagation. Memoization is respected.
     * @returns options that can be provided to with TanstackQuery `useQuery` hooks
     */
    public getUseQueryOptions<TData2 = TPropagatedData>(
        queryClient: QueryClient,
        params: SkipToken | TParams,
        options: {
            select?: ((data: TPropagatedData) => TData2) | undefined;
        } = {}
    ): {
        queryKey: TQueryKey;
        queryFn:
            | SkipToken
            | ((
                  options: QueryFunctionContext<TQueryKey>,
                  queryClient?: QueryClient
              ) => Promise<TData>);
        select: (data: TData) => TData2;
    } {
        if (params === skipToken) {
            return {
                queryKey: noopKey as unknown as TQueryKey,
                queryFn: skipToken,
                select: undefinedSelector as unknown as () => TData2,
            } satisfies Required<
                Pick<
                    UndefinedInitialDataOptions<TData, unknown, TData2, TQueryKey>,
                    OverriddenUseQueryFields
                >
            >;
        }
        return this.getUseSuspenseQueryOptions(queryClient, params, options) satisfies Required<
            Pick<
                UndefinedInitialDataOptions<TData, unknown, TData2, TQueryKey>,
                OverriddenUseQueryFields
            >
        >;
    }

    /**
     * Object with type-safe properties to use resource's query.
     * Applies a `select` (which can be merged with user provided `select`) to propagate+link
     * downstream resources.
     *
     * Produces output that is safe to pass to `useSuspenseQueries` (i.e. doesn't support `skipToken`).
     * Can be merge output with additional options accepted by `useSuspenseQueries`.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Additional user-provided `select` field to do additional transformations after propagation. Memoization is respected.
     * @returns options that can be provided to with TanstackQuery `useQuery` hooks
     */
    public getUseSuspenseQueryOptions<TData2 = TPropagatedData>(
        queryClient: QueryClient,
        params: TParams,
        options: {
            select?: ((data: TPropagatedData) => TData2) | undefined;
        } = {}
    ): {
        queryKey: TQueryKey;
        queryFn: (
            options: QueryFunctionContext<TQueryKey>,
            queryClient?: QueryClient
        ) => Promise<TData>;
        select: (data: TData) => TData2;
    } {
        return {
            queryKey: this.getKey(params),
            queryFn: this.getQueryFn(params),
            select: this.#getSelector(
                { client: queryClient, prefetches: [], revalidateIfStale: false },
                options.select
            ),
        } satisfies Required<
            Pick<
                UseSuspenseQueryOptions<TData, unknown, TData2, TQueryKey>,
                OverriddenUseQueryFields
            >
        >;
    }

    /**
     * Load result from queryFn. Wraps TanstackQuery so results can and will be cached.
     * Results will be "propagated" to downstream queries.
     *
     * Triggers downstream propagation, but returns as soon as this set of data is available.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Everything that you can pass to `queryClient.fetchQuery` besides query fn + key
     * @returns result of queryFn + propagation
     */
    public async fetchQuery(
        queryClient: QueryClient,
        params: TParams,
        options?: Omit<
            FetchQueryOptions<TData, unknown, TData, TQueryKey>,
            OverriddenUseQueryFields
        >
    ): Promise<TPropagatedData> {
        const data = await queryClient.fetchQuery<TData, unknown, TData, TQueryKey>({
            ...options,
            queryKey: this.getKey(params),
            queryFn: this.getQueryFn(params),
        });
        return this.#getSelector<TPropagatedData>({
            client: queryClient,
            prefetches: [],
            revalidateIfStale: true,
        })(data);
    }

    /**
     * Triggers fetching + propagation of downstream fields.
     * Returns a promise that resolves once query resolves (not necessarily once downstream resources are resolved).
     *
     * Will never throw.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Everything that you can pass to `queryClient.prefetchQuery` besides query fn + key
     * @returns promise that this resource is available in cache (or failed internally, but promise still resolves)
     */
    public async prefetchQuery(
        queryClient: QueryClient,
        params: TParams,
        options?: Omit<
            FetchQueryOptions<TData, unknown, TData, TQueryKey>,
            OverriddenUseQueryFields
        >
    ): Promise<Linked<TParams, TQueryKey, TData, this>> {
        // Can't just call prefetch from client because we need to route to the custom selectors
        // (which `fetch` is configured to do)
        // Actual implementation is a similar "call fetch and swallow" so easy enough to duplicate
        try {
            await this.fetchQuery(queryClient, params, options);
        } catch {}
        return new Linked(this, params, queryClient);
    }

    /**
     * Load query data either from cache or query.
     * Will wait until all downstream queries are also fully loaded.
     *
     * Will propagate errors if any downstream methods fail to load (unless link's `isolateErrors` is set).
     *
     * This is the method to call server-side at top-level to ensure the component is ready to go.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param options - everything normally provideable to `ensureQueryData` minus key + query
     * @returns stale data from cache or recent query data
     */
    public async ensureQueryData(
        queryClient: QueryClient,
        params: TParams,
        options: Omit<
            EnsureQueryDataOptions<TData, unknown, TData, TQueryKey>,
            OverriddenUseQueryFields
        > = {}
    ): Promise<TPropagatedData> {
        const data = await queryClient.ensureQueryData({
            ...options,
            queryKey: this.getKey(params),
            queryFn: this.getQueryFn(params),
        });
        const prefetches: Promise<void>[] = [];

        const response = this.#getSelector<TPropagatedData>({
            prefetches,
            client: queryClient,
            revalidateIfStale: options.revalidateIfStale ?? false,
        })(data);

        await Promise.all(prefetches);

        return response;
    }

    /**
     * Set data directly in cache. Note that data should should match the result of original queryFn,
     * not any propagation.
     * See {@link populate} if you want to leave behind params that can be used to used to re-query data in future.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param updater - either direct data value, or callback (providing old value) to compute latest value
     * @param options - everything normally provideable to `setQueryData`
     * @returns Recently set data (if set)
     */
    public setQueryData(
        queryClient: QueryClient,
        params: TParams,
        updater: Updater<TData | undefined, TData | undefined>,
        options?: SetDataOptions
    ): TData | undefined {
        return queryClient.setQueryData<TData, TQueryKey, TData>(
            this.getKey(params),
            updater,
            options
        );
    }

    /**
     * Very light wrapper around {@link setQueryData}.
     *
     * Set data in cache, then return parameters than can be re-used in the future to fetch from cache.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param updater - either direct data value, or callback (providing old value) to compute latest value
     * @param options - everything normally provideable to `setQueryData`
     * @returns parameters to load value (or trigger fresh query) in future
     */
    public populate(
        queryClient: QueryClient,
        params: TParams,
        updater: Updater<TData | undefined, TData | undefined>,
        options?: SetDataOptions
    ): TParams {
        this.setQueryData(queryClient, params, updater, options);
        return params;
    }

    /**
     * ONLY CALL THIS FUNCTION DURING {@link propagate} (from either a `resource` *or* `infinite`)
     *
     * Triggers a prefetch of the relevant query, and returns a "Link" that can
     * be re-used in the future to load value directly from cache (still following Tanstack concepts of staleness).
     * See `usePrefetched...Query` hooks.
     *
     * Re-linking the same resource multiple times is safe (effectively the same as calling `prefetchQuery` multiple times, which will be deduped by the cache).
     *
     * @param params - user provided params to identify query
     * @param options - Everything that can be passed to regular `prefetch` call minus query + key
     * @returns "link" to pass to preload hooks
     * @throws if called outside of {@link propagate}
     */
    public link(
        params: TParams,
        options: Omit<
            EnsureQueryDataOptions<TData, unknown, TData, TQueryKey>,
            OverriddenUseQueryFields
        > & {
            isolateErrors?: boolean | undefined;
        } = {}
    ): Linked<TParams, TQueryKey, TData, this> {
        const linksActive = getLinksActive();
        if (!linksActive) {
            throw new Error('Cannot call `link()` outside of `propagate`');
        }
        const {
            isolateErrors,
            revalidateIfStale = linksActive.revalidateIfStale,
            ...rest
        } = options;
        let promise: Promise<unknown> = this.ensureQueryData(linksActive.client, params, {
            revalidateIfStale,
            ...rest,
        });
        if (isolateErrors) {
            promise = promise.catch(() => {});
        }
        linksActive.prefetches.push(promise);
        return new Linked(this, params, linksActive.client);
    }

    /**
     * Used to trigger downstream fetching of queries. Should implement `link` calls during the callback.
     *
     * Links are not safe to call during the regular queryFn because they are not serializable
     * (and data in cache must be serializable for server-side).
     *
     * So propagation happens externally from the Tanstack cache to trigger downstream preloads.
     *
     * The result is the new type that will be returned by hooks and `fetch`, so ideally it should "extend"
     * the existing result.
     *
     * e.g.
     * ```
     * books.propagate(book => ({
     *     ...book,
     *     author: authors.link({ authorId: book.authorId })
     * }));
     * ```
     *
     * @param map - function mapping original query data to updated data with preloaded links
     * @returns Updated resource (with updated types!), which can be used in all places resource is normally used (and can even be re-propagated)
     */
    public propagate<TData2>(
        map: (source: TPropagatedData) => TData2
    ): Resource<TParams, TData, TData2, TQueryKey> {
        return new Resource(this, map);
    }

    #getMemoizedSelector(
        queryClient: QueryClient,
        selector: (x: TPropagatedData) => unknown
    ): ((x: TData) => unknown) | undefined {
        return this.#useSelector.get(queryClient)?.get(selector);
    }

    #setMemoizedSelector(
        queryClient: QueryClient,
        selector: (x: TPropagatedData) => unknown,
        memoized: (x: TData) => unknown
    ): void {
        let firstMap = this.#useSelector.get(queryClient);
        if (!firstMap) {
            firstMap = new WeakMap();
            this.#useSelector.set(queryClient, firstMap);
        }
        firstMap.set(selector, memoized);
    }

    /**
     * Combine user provided `select` with internal propagation selectors.
     * Memoize the result (based on user input) to maintain memoization as best as possible.
     * (TanstackQuery will avoid re-running selectors in hooks if all references are unchanged as a performance optimization).
     *
     * @param links - query client + collection of prefetch promises
     * @param rawSelect - user provided `select`
     * @returns selector that transforms query data all the way to user-specified data
     */
    #getSelector<T>(
        links: LinksActive,
        rawSelect?: (source: TPropagatedData) => T
    ): (source: TData) => T {
        const select = rawSelect ?? (noopSelector as (source: TPropagatedData) => T);

        const existing = this.#getMemoizedSelector(links.client, select);
        if (existing) {
            return existing as (source: TData) => T;
        }

        const selector = (source: TData): T => {
            let value: unknown = source;
            try {
                setLinksActive(links);
                for (const subSelector of this.#selectors) {
                    value = subSelector(value);
                }
            } finally {
                setLinksActive(null);
            }
            return select(value as TPropagatedData);
        };
        this.#setMemoizedSelector(links.client, select, selector);
        return selector;
    }
}
export type { Resource };

/**
 * Type-safe reference to react queries that are *not* "infinite".
 *
 * Ensures consistent usage of keys + queryFn, and provides convience methods around
 * various QueryClient methods.
 *
 * Can be passed to "normalized" hooks for `useQuery`-like behavior.
 * Can also be "propagated" to other "linked" resources to trigger downstream loading from a single entrypoint.
 *
 * @param params - create resource based off key + queryFn
 * @returns resource instance
 */
export const resource = <
    TParams,
    TData,
    TQueryKey extends readonly unknown[] = readonly unknown[],
>(params: {
    /**
     * Either a query key literal, or function computing query key based off params (which will be provided at query time)
     */
    key: TQueryKey | ((params: TParams) => TQueryKey);
    /**
     * The core cached function that will load data. Will have access to `params`, as well as everything else provided by TanstackQuery.
     */
    queryFn: (
        options: QueryFunctionContextWithParams<TParams, never, TQueryKey>,
        queryClient?: QueryClient
    ) => Promise<TData> | TData;
}): Resource<TParams, TData, TData, TQueryKey> => new Resource(params);

/**
 * Type-safe wrapper around `useQuery`.
 *
 * If data is expected to have been prefetched already, see {@link useNormalizedPrefetchedQuery}.
 *
 * @param res - resource instance
 * @param params - parameters to compute key+queryFn. Can be provided manually, from a previous `populate`, or a `linked.getParams()`
 * @param options - Everything you usually provide to `useQuery`, minus key + query
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns See [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
 */
export const useNormalizedQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = TPropagatedData,
>(
    res: Resource<TParams, TData, TPropagatedData, TQueryKey>,
    params: SkipToken | TParams,
    {
        select,
        ...options
    }: Omit<UseQueryOptions<TData, unknown, TSelectedData, TQueryKey>, OverriddenUseQueryFields> & {
        select?: (data: TPropagatedData) => TSelectedData;
    } = {},
    queryClient?: QueryClient
): UseQueryResult<TSelectedData, unknown> => {
    const qc = useQueryClient(queryClient);
    return useQuery(
        {
            ...options,
            ...res.getUseQueryOptions(qc, params, { select }),
        },
        qc
    );
};

/**
 * Type-safe wrapper around `useQuery`, that enforces the query (and all the downstream dependencies)
 * are prefetched.
 *
 * Note that depending on how preloading is implemented (e.g. via {@link useNormalizedPrefetchQuery}) the query
 * may still be in flight.
 *
 * @param linked - prefetched reference to query
 * @param options - Everything you usually provide to `useQuery`, minus key + query
 * @returns See [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
 */
export const useNormalizedPrefetchedQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = TPropagatedData,
>(
    linked:
        | Linked<TParams, TQueryKey, TData, Resource<TParams, TData, TPropagatedData, TQueryKey>>
        | SkipToken
        | null
        | undefined,
    {
        select,
        ...options
    }: Omit<UseQueryOptions<TData, unknown, TSelectedData, TQueryKey>, OverriddenUseQueryFields> & {
        select?: (data: TPropagatedData) => TSelectedData;
    } = {}
): UseQueryResult<TSelectedData, unknown> => {
    const disabled = !linked || linked === skipToken;
    return useQuery(
        disabled
            ? {
                  queryKey: noopKey as unknown as TQueryKey,
                  queryFn: skipToken,
                  select: undefinedSelector as unknown as () => TSelectedData,
              }
            : {
                  ...options,
                  ...linked
                      .getQueryable()
                      .getUseQueryOptions(linked.getQueryClient(), linked.getParams(), {
                          select,
                      }),
              },
        disabled ? getDummyQueryClient() : linked.getQueryClient()
    );
};

/**
 * Type-safe wrapper around `useSuspenseQuery`.
 *
 * If data is expected to have been prefetched already, see {@link useNormalizedPrefetchedSuspenseQuery}.
 *
 * @param res - resource instance
 * @param params - parameters to compute key+queryFn. Can be provided manually, from a previous `populate`, or a `linked.getParams()`
 * @param options - Everything you usually provide to `useSuspenseQuery`, minus key + query
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns See [useSuspenseQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery)
 */
export const useNormalizedSuspenseQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = TPropagatedData,
>(
    res: Resource<TParams, TData, TPropagatedData, TQueryKey>,
    params: TParams,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseQueryOptions<TData, unknown, TSelectedData, TQueryKey>,
        OverriddenUseQueryFields
    > & {
        select?: (data: TPropagatedData) => TSelectedData;
    } = {},
    queryClient?: QueryClient
): UseSuspenseQueryResult<TSelectedData, unknown> => {
    const qc = useQueryClient(queryClient);
    return useSuspenseQuery(
        {
            ...options,
            ...res.getUseSuspenseQueryOptions(qc, params, { select }),
        },
        qc
    );
};

/**
 * Similar to {@link useNormalizedSuspenseQuery}.
 *
 * Re-introduces `skipToken`. If provided in lieu of params, entire result is null.
 * Useful when data *should* be loaded, but might not exist at all.
 * e.g. User's favorite book is loaded, or they don't have a favorite book to load.
 *
 * If data is expected to have been prefetched already, see {@link useNormalizedNullablePrefetchedSuspenseQuery}.
 *
 * @param res - resource instance
 * @param params - parameters to compute key+queryFn. Can be provided manually, from a previous `populate`, or a `linked.getParams()` OR `skipToken`
 * @param options - Everything you usually provide to `useSuspenseQuery`, minus key + query
 * @param queryClient - Instance of QueryClient to override value coming from context
 * @returns See [useSuspenseQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery)
 */
export const useNormalizedNullableSuspenseQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = TPropagatedData,
>(
    res: Resource<TParams, TData, TPropagatedData, TQueryKey>,
    params: SkipToken | TParams,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseQueryOptions<TData, unknown, TSelectedData, TQueryKey>,
        OverriddenUseQueryFields
    > & {
        select?: (data: TPropagatedData) => TSelectedData;
    } = {},
    queryClient?: QueryClient
): UseSuspenseQueryResult<TSelectedData, unknown> | null => {
    const qc = useQueryClient(queryClient);

    const disabled = params === skipToken;

    const result = useSuspenseQuery(
        disabled
            ? {
                  queryKey: noopKey as unknown as TQueryKey,
                  queryFn: undefinedSelector as unknown as () => TData,
                  select: undefinedSelector as unknown as () => TSelectedData,
              }
            : {
                  ...options,
                  ...res.getUseSuspenseQueryOptions(qc, params, {
                      select,
                  }),
              },
        disabled ? getDummyQueryClient() : qc
    );
    return disabled ? null : result;
};

/**
 * Type-safe wrapper around `useSuspenseQuery`, that enforces the query (and all the downstream dependencies)
 * are prefetched.
 *
 * Note that depending on how preloading is implemented (e.g. via {@link useNormalizedPrefetchQuery}) the query
 * may still be in flight, meaning this component would suspend.
 *
 * @param linked - prefetched reference to query
 * @param options - Everything you usually provide to `useSuspenseQuery`, minus key + query
 * @returns See [useSuspenseQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery)
 */
export const useNormalizedPrefetchedSuspenseQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = TPropagatedData,
>(
    linked: Linked<TParams, TQueryKey, TData, Resource<TParams, TData, TPropagatedData, TQueryKey>>,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseQueryOptions<TData, unknown, TSelectedData, TQueryKey>,
        OverriddenUseQueryFields
    > & {
        select?: (data: TPropagatedData) => TSelectedData;
    } = {}
): UseSuspenseQueryResult<TSelectedData, unknown> =>
    useSuspenseQuery({
        ...options,
        ...linked
            .getQueryable()
            .getUseSuspenseQueryOptions(linked.getQueryClient(), linked.getParams(), {
                select,
            }),
    });

/**
 * Similar to {@link useNormalizedPrefetchedSuspenseQuery}.
 *
 * Re-introduces `skipToken`. If provided in lieu of resource, entire result is null.
 * Useful when data *should* be loaded, but might not exist at all.
 *
 * @param linked - prefetched reference to query OR undefined/null OR skipToken
 * @param options - Everything you usually provide to `useSuspenseQuery`, minus key + query
 * @returns See [useSuspenseQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseQuery)
 */
export const useNormalizedNullablePrefetchedSuspenseQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = TPropagatedData,
>(
    linked:
        | Linked<TParams, TQueryKey, TData, Resource<TParams, TData, TPropagatedData, TQueryKey>>
        | SkipToken
        | null
        | undefined,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseQueryOptions<TData, unknown, TSelectedData, TQueryKey>,
        OverriddenUseQueryFields
    > & {
        select?: (data: TPropagatedData) => TSelectedData;
    } = {}
): UseSuspenseQueryResult<TSelectedData, unknown> | null => {
    const disabled = !linked || linked === skipToken;

    const result = useSuspenseQuery(
        disabled
            ? {
                  queryKey: noopKey as unknown as TQueryKey,
                  queryFn: undefinedSelector as unknown as () => TData,
                  select: undefinedSelector as unknown as () => TSelectedData,
              }
            : {
                  ...options,
                  ...linked
                      .getQueryable()
                      .getUseSuspenseQueryOptions(linked.getQueryClient(), linked.getParams(), {
                          select,
                      }),
              },
        disabled ? getDummyQueryClient() : linked.getQueryClient()
    );

    return disabled ? null : result;
};

/**
 * Type-safe implementation of [usePrefetchQuery](https://tanstack.com/query/latest/docs/framework/react/reference/usePrefetchQuery).
 *
 * @param res - resource instance
 * @param params - parameters to compute key+queryFn. Can be provided manually, from a previous `populate`, or a `linked.getParams()`
 * @param options - Everything you usually provide to `prefetchQuery`, minus key + query
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns A linked query that can be passed to `useNormalizePrefetched...` hooks.
 */
export const useNormalizedPrefetchQuery = <
    TParams,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
>(
    res: Resource<TParams, TData, TPropagatedData, TQueryKey>,
    params: TParams,
    options?: Omit<FetchQueryOptions<TData, unknown, TData, TQueryKey>, OverriddenUseQueryFields>,
    queryClient?: QueryClient
): Linked<TParams, TQueryKey, TData, Resource<TParams, TData, TPropagatedData, TQueryKey>> => {
    const qc = useQueryClient(queryClient);

    // Mirrors Tanstack implementation. Only loads initial time, does not "refresh".
    if (!res.getQueryState(qc, params)) {
        void res.prefetchQuery(qc, params, options);
    }
    return new Linked(res, params, qc);
};

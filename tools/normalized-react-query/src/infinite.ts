import type {
    EnsureInfiniteQueryDataOptions,
    FetchInfiniteQueryOptions,
    GetNextPageParamFunction,
    GetPreviousPageParamFunction,
    InfiniteData,
    QueryClient,
    QueryFunctionContext,
    SetDataOptions,
    SkipToken,
    UndefinedInitialDataInfiniteOptions,
    Updater,
    UseInfiniteQueryOptions,
    UseInfiniteQueryResult,
    UseSuspenseInfiniteQueryOptions,
    UseSuspenseInfiniteQueryResult,
} from '@tanstack/react-query';
import type {
    InfiniteSet,
    LinksActive,
    OverriddenUseInfiniteQueryFields,
    QueryFunctionContextWithParams,
    typeCache,
} from './lib/types.js';
import {
    skipToken,
    useInfiniteQuery,
    useQueryClient,
    useSuspenseInfiniteQuery,
} from '@tanstack/react-query';
import { getLinksActive, Linked, setLinksActive } from './lib/linked.js';
import {
    getDummyQueryClient,
    noopKey,
    noopSelector,
    Queryable,
    undefinedSelector,
} from './lib/queryable.js';

/**
 * Type-safe wrapper around "infinite" (paginateable) queries in TanstackQuery.
 *
 * Class is not exposed directly to avoid subclassing and constructor overloads.
 * See exported {@link infinite} for public interface.
 *
 * @template TParams - user provdided params to trigger a query
 * @template TPageParam - user provided + computed pagination keys
 * @template TData - return type of base `queryFn`
 * @template TPropagatedData - updated type after "propagate" calls. Impacts return values from various methods, but not the actual value provided/received from cache.
 * @template TQueryKey - type of TanstackQuery key computed that uniquely identifies resource + params
 */
class Infinite<
    TParams,
    TPageParam,
    TData,
    TPropagatedData = TData,
    TQueryKey extends readonly unknown[] = readonly unknown[],
> extends Queryable<TParams, TQueryKey, InfiniteData<TData, TPageParam>> {
    /**
     * Used to access type parameters.
     *
     * __DO NOT USE__
     */
    public declare readonly [typeCache]?: {
        data: InfiniteData<TData, TPageParam>;
        params: TParams;
        key: TQueryKey;
        propagated: TPropagatedData;
    };

    readonly #getInitialPageParam: (params: TParams) => TPageParam;
    readonly #getNextPageParam: (params: {
        params: TParams;
        lastPage: TData;
        allPages: TData[];
        lastPageParam: TPageParam;
        allPageParams: TPageParam[];
    }) => TPageParam | null | undefined;
    readonly #getPreviousPageParam:
        | ((params: {
              params: TParams;
              firstPage: TData;
              allPages: TData[];
              firstPageParam: TPageParam;
              allPageParams: TPageParam[];
          }) => TPageParam | null | undefined)
        | null;
    readonly #queryFn: (
        options: QueryFunctionContextWithParams<TParams, TPageParam, TQueryKey>,
        queryClient?: QueryClient
    ) => Promise<TData> | TData;
    readonly #selectors:
        | readonly [
              ...((x: InfiniteSet<unknown, unknown>) => unknown)[],
              (x: InfiniteSet<unknown, unknown>) => TPropagatedData,
          ]
        | [];
    readonly #useSelector = new WeakMap<
        QueryClient,
        WeakMap<
            (x: InfiniteData<TPropagatedData, TPageParam>) => unknown,
            (data: InfiniteData<TData, TPageParam>) => unknown
        >
    >();

    public constructor(
        ...options:
            | [
                  {
                      key: TQueryKey | ((params: TParams) => TQueryKey);
                      getInitialPageParam: TPageParam | ((params: TParams) => TPageParam);
                      getNextPageParam: (params: {
                          lastPage: TData;
                          allPages: TData[];
                          lastPageParam: TPageParam;
                          allPageParams: TPageParam[];
                      }) => TPageParam | null | undefined;
                      getPreviousPageParam?:
                          | ((params: {
                                firstPage: TData;
                                allPages: TData[];
                                firstPageParam: TPageParam;
                                allPageParams: TPageParam[];
                            }) => TPageParam | null | undefined)
                          | null
                          | undefined;
                      queryFn: (
                          options: QueryFunctionContextWithParams<TParams, TPageParam, TQueryKey>,
                          queryClient?: QueryClient
                      ) => Promise<TData> | TData;
                  },
              ]
            | [Infinite<TParams, TPageParam, TData, any, TQueryKey>, (x: any) => TPropagatedData]
    ) {
        super(options[0]);
        if (options.length === 1) {
            const [{ getInitialPageParam, getNextPageParam, getPreviousPageParam, queryFn }] =
                options;
            this.#getInitialPageParam =
                typeof getInitialPageParam === 'function'
                    ? (getInitialPageParam as (params: TParams) => TPageParam)
                    : () => getInitialPageParam;
            this.#getNextPageParam = getNextPageParam;
            this.#getPreviousPageParam = getPreviousPageParam ?? null;
            this.#queryFn = queryFn;
            this.#selectors = [];
        } else {
            const [parent, selector] = options;
            this.#getInitialPageParam = parent.#getInitialPageParam;
            this.#getNextPageParam = parent.#getNextPageParam;
            this.#getPreviousPageParam = parent.#getPreviousPageParam;
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
    ): (
        options: QueryFunctionContext<TQueryKey, TPageParam>,
        queryClient?: QueryClient
    ) => Promise<TData> {
        return async options => this.#queryFn({ ...options, params });
    }

    /**
     * Returns `initialPageParam` to pass to TanstackQuery.
     *
     * @param params - user provided params
     * @returns query result
     */
    public getInitialPageParam(params: TParams): TPageParam {
        return this.#getInitialPageParam(params);
    }

    /**
     * Returns `getNextPageParam` to pass to TanstackQuery.
     *
     * @param params - user provided params
     * @returns "next page param" callback
     */
    public getGetNextPageParam(params: TParams): GetNextPageParamFunction<TPageParam, TData> {
        return (lastPage, allPages, lastPageParam, allPageParams) =>
            this.#getNextPageParam({
                params,
                lastPage,
                allPages,
                lastPageParam,
                allPageParams,
            });
    }

    /**
     * Returns `getPreviousPageParam` to pass to TanstackQuery.
     *
     * Defaults to an undefined-returning function (which indicaties no "previous" pages are available).
     *
     * @param params - user provided params
     * @returns "previous page param" callback
     */
    public getGetPreviousPageParam(
        params: TParams
    ): GetPreviousPageParamFunction<TPageParam, TData> {
        if (this.#getPreviousPageParam) {
            const getPreviousPageParam = this.#getPreviousPageParam.bind(this);
            return (firstPage, allPages, firstPageParam, allPageParams) =>
                getPreviousPageParam({
                    params,
                    firstPage,
                    allPages,
                    firstPageParam,
                    allPageParams,
                });
        }
        return undefinedSelector;
    }

    /**
     * Object with type-safe properties to use infinite's query.
     * Applies a `select` (which can be merged with user provided `select`) to propagate+link
     * downstream resources.
     *
     * Produces output that is safe to pass to `useInfiniteQuery` (i.e. supports `skipToken`).
     * Can be merge output with additional options accepted by `useInfiniteQuery`.
     *
     * If you do not need to support "disabling", this is interchangeable with {@link getUseSuspenseInfiniteQueryOptions}.
     *
     * Due to lack of a `useInfiniteQueries` API, end users should rarely need this method
     * instead of provided hooks.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Additional user-provided `select` field to do additional transformations after propagation. Memoization is respected.
     * @returns options that can be provided to TanstackQuery `useInfiniteQuery` hooks
     */
    public getUseInfiniteQueryOptions<TData2 = InfiniteData<TPropagatedData, TPageParam>>(
        queryClient: QueryClient,
        params: SkipToken | TParams,
        options: {
            select?: ((data: InfiniteData<TPropagatedData, TPageParam>) => TData2) | undefined;
        } = {}
    ): {
        queryKey: TQueryKey;
        queryFn:
            | SkipToken
            | ((
                  options: QueryFunctionContext<TQueryKey, TPageParam>,
                  queryClient?: QueryClient
              ) => Promise<TData>);
        select: (data: InfiniteData<TData, TPageParam>) => TData2;
        initialPageParam: TPageParam;
        getNextPageParam: GetNextPageParamFunction<TPageParam, TData>;
        getPreviousPageParam: GetPreviousPageParamFunction<TPageParam, TData>;
    } {
        if (params === skipToken) {
            return {
                queryKey: noopKey as unknown as TQueryKey,
                queryFn: skipToken,
                select: undefinedSelector as unknown as () => TData2,
                initialPageParam: null as unknown as TPageParam,
                getNextPageParam: undefinedSelector,
                getPreviousPageParam: undefinedSelector,
            } satisfies Required<
                Pick<
                    UndefinedInitialDataInfiniteOptions<
                        TData,
                        unknown,
                        TData2,
                        TQueryKey,
                        TPageParam
                    >,
                    OverriddenUseInfiniteQueryFields
                >
            >;
        }
        return this.getUseSuspenseInfiniteQueryOptions(queryClient, params, options);
    }

    /**
     * Object with type-safe properties to use infinite's query.
     * Applies a `select` (which can be merged with user provided `select`) to propagate+link
     * downstream resources.
     *
     * Produces output that is safe to pass to `useSuspenseInfiniteQuery` (i.e. does not support `skipToken`).
     * Can be merge output with additional options accepted by `useSuspenseInfiniteQuery`.
     *
     * Due to lack of a `useSuspenseInfiniteQueries` API, end users should rarely need this method
     * instead of provided hooks.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Additional user-provided `select` field to do additional transformations after propagation. Memoization is respected.
     * @returns options that can be provided to TanstackQuery `useInfiniteQuery` hooks
     */
    public getUseSuspenseInfiniteQueryOptions<TData2 = InfiniteData<TPropagatedData, TPageParam>>(
        queryClient: QueryClient,
        params: TParams,
        options: {
            select?: ((data: InfiniteData<TPropagatedData, TPageParam>) => TData2) | undefined;
        } = {}
    ): {
        queryKey: TQueryKey;
        queryFn: (
            options: QueryFunctionContext<TQueryKey, TPageParam>,
            queryClient?: QueryClient
        ) => Promise<TData>;
        select: (data: InfiniteData<TData, TPageParam>) => TData2;
        initialPageParam: TPageParam;
        getNextPageParam: GetNextPageParamFunction<TPageParam, TData>;
        getPreviousPageParam: GetPreviousPageParamFunction<TPageParam, TData>;
    } {
        return {
            queryKey: this.getKey(params),
            queryFn: this.getQueryFn(params),
            initialPageParam: this.getInitialPageParam(params),
            getPreviousPageParam: this.getGetPreviousPageParam(params),
            getNextPageParam: this.getGetNextPageParam(params),
            select: this.#getSelector(
                { client: queryClient, prefetches: [], revalidateIfStale: false },
                options.select
            ),
        } satisfies Required<
            Pick<
                UseSuspenseInfiniteQueryOptions<TData, unknown, TData2, TQueryKey, TPageParam>,
                OverriddenUseInfiniteQueryFields
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
     * @param options - Everything that you can pass to `queryClient.fetchInfiniteQuery` besides query fn + key + page params
     * @returns result of queryFn + propagation
     */
    public async fetchInfiniteQuery(
        queryClient: QueryClient,
        params: TParams,
        options?: Omit<
            FetchInfiniteQueryOptions<TData, unknown, TData, TQueryKey, TPageParam>,
            OverriddenUseInfiniteQueryFields
        >
    ): Promise<InfiniteData<TPropagatedData, TPageParam>> {
        const data = await queryClient.fetchInfiniteQuery<
            TData,
            unknown,
            TData,
            TQueryKey,
            TPageParam
        >({
            ...options,
            getNextPageParam: this.getGetNextPageParam(params),
            initialPageParam: this.getInitialPageParam(params),
            queryFn: this.getQueryFn(params),
            queryKey: this.getKey(params),
        });
        return this.#getSelector<InfiniteData<TPropagatedData, TPageParam>>({
            client: queryClient,
            prefetches: [],
            revalidateIfStale: true,
        })(data);
    }

    /**
     * Triggers fetching (if not already cached) + propagation of downstream fields.
     * Returns a promise that resolves once query resolves (not necessarily once downstream resources are resolved).
     *
     * Will never throw.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to inject into callback
     * @param options - Everything that you can pass to `queryClient.prefetchInfiniteQuery` besides query fn + key + page params
     * @returns promise that this resource is available in cache (or failed internally, but promise still resolves)
     */
    public async prefetchInfiniteQuery(
        queryClient: QueryClient,
        params: TParams,
        options?: Omit<
            FetchInfiniteQueryOptions<TData, unknown, TData, TQueryKey, TPageParam>,
            OverriddenUseInfiniteQueryFields
        >
    ): Promise<Linked<TParams, TQueryKey, InfiniteData<TData, TPageParam>, this>> {
        // Can't just call prefetch from client because we need to route to the custom selectors
        // (which `fetch` is configured to do)
        // Actual implementation is a similar "call fetch and swallow" so easy enough to duplicate
        try {
            await this.fetchInfiniteQuery(queryClient, params, options);
        } catch {}
        return new Linked(this, params, queryClient);
    }

    /**
     * Consistency alias for {@link getQueryData}.
     *
     * @override
     */
    public getInfiniteQueryData(
        queryClient: QueryClient,
        params: TParams
    ): InfiniteData<TData, TPageParam> | undefined {
        return this.getQueryData(queryClient, params);
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
     * @param options - everything normally provideable to `ensureInfiniteQueryData` minus key + query + page params
     * @returns stale data from cache or recent query data
     */
    public async ensureInfiniteQueryData(
        queryClient: QueryClient,
        params: TParams,
        options: Omit<
            EnsureInfiniteQueryDataOptions<TData, unknown, TData, TQueryKey, TPageParam>,
            OverriddenUseInfiniteQueryFields
        > = {}
    ): Promise<InfiniteData<TPropagatedData, TPageParam>> {
        const data = await queryClient.ensureInfiniteQueryData({
            ...options,
            getNextPageParam: this.getGetNextPageParam(params),
            initialPageParam: this.getInitialPageParam(params),
            queryFn: this.getQueryFn(params),
            queryKey: this.getKey(params),
        });
        const prefetches: Promise<void>[] = [];
        const response = this.#getSelector<InfiniteData<TPropagatedData, TPageParam>>({
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
     * See `populate` if you want to leave behind params that can be used to used to re-query data in future.
     *
     * @param queryClient - instance of TanstackQuery QueryClient
     * @param params - user provided params to identify query
     * @param updater - either direct data value, or callback (providing old value) to compute latest value
     * @param options - everything normally provideable to `setQueryData`
     * @returns Recently set data (if set)
     */
    public setInfiniteQueryData(
        queryClient: QueryClient,
        params: TParams,
        updater: Updater<
            InfiniteData<TData, TPageParam> | undefined,
            InfiniteData<TData, TPageParam> | undefined
        >,
        options?: SetDataOptions
    ): InfiniteData<TData, TPageParam> | undefined {
        return queryClient.setQueryData<
            InfiniteData<TData, TPageParam>,
            TQueryKey,
            InfiniteData<TData, TPageParam>
        >(this.getKey(params), updater, options);
    }

    /**
     * Very light wrapper around `setInfiniteQueryData`.
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
        updater: Updater<
            InfiniteData<TData, TPageParam> | undefined,
            InfiniteData<TData, TPageParam> | undefined
        >,
        options?: SetDataOptions
    ): TParams {
        this.setInfiniteQueryData(queryClient, params, updater, options);
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
     * @throws if called outside of `propagate`
     */
    public link(
        params: TParams,
        options: Omit<
            EnsureInfiniteQueryDataOptions<TData, unknown, TData, TQueryKey, TPageParam>,
            OverriddenUseInfiniteQueryFields
        > & {
            isolateErrors?: boolean | undefined;
        } = {}
    ): Linked<TParams, TQueryKey, InfiniteData<TData, TPageParam>, this> {
        const linksActive = getLinksActive();
        if (!linksActive) {
            throw new Error('Cannot call `link()` outside of `propagate`');
        }
        const {
            isolateErrors,
            revalidateIfStale = linksActive.revalidateIfStale,
            ...rest
        } = options;
        let promise: Promise<unknown> = this.ensureInfiniteQueryData(linksActive.client, params, {
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
     * Callback is called *per* page+param. This is because:
     * 1. Pages of resources shouldn't depend on other pages
     * 2. Constructing a "batched GET" query from *all* pages would result in a cache bust every time a new page came through.
     *
     * e.g.
     * ```
     * books.propagate(({ page }) => page.map(book => ({
     *     ...book,
     *     author: authors.link({ authorId: book.authorId })
     * })));
     * ```
     *
     * @param map - function mapping original query data to updated data with preloaded links
     * @returns Updated resource (with updated types!), which can be used in all places resource is normally used (and can even be re-propagated)
     */
    public propagate<TData2>(
        map: (source: InfiniteSet<TPropagatedData, TPageParam>) => TData2
    ): Infinite<TParams, TPageParam, TData, TData2, TQueryKey> {
        return new Infinite<TParams, TPageParam, TData, TData2, TQueryKey>(this, map);
    }

    #getMemoizedSelector(
        queryClient: QueryClient,
        selector: (x: InfiniteData<TPropagatedData, TPageParam>) => unknown
    ): ((x: InfiniteData<TData, TPageParam>) => unknown) | undefined {
        return this.#useSelector.get(queryClient)?.get(selector);
    }

    #setMemoizedSelector(
        queryClient: QueryClient,
        selector: (x: InfiniteData<TPropagatedData, TPageParam>) => unknown,
        memoized: (x: InfiniteData<TData, TPageParam>) => unknown
    ): void {
        let firstMap = this.#useSelector.get(queryClient);
        if (!firstMap) {
            firstMap = new WeakMap();
            this.#useSelector.set(queryClient, firstMap);
        }
        firstMap.set(selector, memoized);
    }

    #getSelector<T>(
        links: LinksActive,
        rawSelect?: (source: InfiniteData<TPropagatedData, TPageParam>) => T
    ): (data: InfiniteData<TData, TPageParam>) => T {
        const select =
            rawSelect ?? (noopSelector as (source: InfiniteData<TPropagatedData, TPageParam>) => T);

        const existing = this.#getMemoizedSelector(links.client, select);
        if (existing) {
            return existing as (data: InfiniteData<TData, TPageParam>) => T;
        }

        const selector = (source: InfiniteData<TData, TPageParam>): T => {
            const pages: TPropagatedData[] = [];
            try {
                setLinksActive(links);
                for (const [i, pageParam] of source.pageParams.entries()) {
                    let value: unknown = source.pages[i];
                    for (const subSelector of this.#selectors) {
                        value = subSelector({ page: value, pageParam });
                    }
                    pages.push(value as TPropagatedData);
                }
            } finally {
                setLinksActive(null);
            }
            return select({
                pages,
                pageParams: source.pageParams,
            });
        };
        this.#setMemoizedSelector(links.client, select, selector);
        return selector;
    }
}

export type { Infinite };

/**
 * Type-safe reference to react queries that are "infinite" (paginated).
 *
 * Ensures consistent usage of keys + queryFn + page params, and provides convience methods around
 * various QueryClient methods.
 *
 * Can be passed to "normalized" hooks for `useQuery`-like behavior.
 * Can also be "propagated" to other "linked" resources to trigger downstream loading from a single entrypoint.
 *
 * @param params - create resource based off key + queryFn
 * @returns resource instance
 */
export const infinite = <
    TParams,
    TData,
    TPageParam,
    TQueryKey extends readonly unknown[] = readonly unknown[],
>(params: {
    key: TQueryKey | ((params: TParams) => TQueryKey);
    getInitialPageParam: TPageParam | ((params: TParams) => TPageParam);
    getNextPageParam: (params: {
        lastPage: TData;
        allPages: TData[];
        lastPageParam: TPageParam;
        allPageParams: TPageParam[];
    }) => TPageParam | null | undefined;
    getPreviousPageParam?:
        | ((params: {
              firstPage: TData;
              allPages: TData[];
              firstPageParam: TPageParam;
              allPageParams: TPageParam[];
          }) => TPageParam | null | undefined)
        | null
        | undefined;
    queryFn: (
        options: QueryFunctionContextWithParams<TParams, TPageParam, TQueryKey>,
        queryClient?: QueryClient
    ) => Promise<TData> | TData;
}): Infinite<TParams, TPageParam, TData, TData, TQueryKey> => new Infinite(params);

/**
 * Type-safe wrapper around `useInfiniteQuery`.
 *
 * If data is expected to have been prefetched already, see {@link useNormalizedPrefetchedInfiniteQuery}.
 *
 * @param inf - infinite instance
 * @param params - parameters to compute key+queryFn+pageParams. Can be provided manually, from a previous `populate`, or a `linked.getParams()`
 * @param options - Everything you usually provide to `useInfiniteQuery`, minus key + query + page params
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns See [useInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useInfiniteQuery)
 */
export const useNormalizedInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = InfiniteData<TPropagatedData, TPageParam>,
>(
    inf: Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>,
    params: SkipToken | TParams,
    {
        select,
        ...options
    }: Omit<
        UseInfiniteQueryOptions<TData, unknown, TSelectedData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    > & {
        select?: (data: InfiniteData<TPropagatedData, TPageParam>) => TSelectedData;
    } = {},
    queryClient?: QueryClient
): UseInfiniteQueryResult<TSelectedData, unknown> => {
    const qc = useQueryClient(queryClient);
    return useInfiniteQuery(
        {
            ...options,
            ...inf.getUseInfiniteQueryOptions(qc, params, { select }),
        },
        qc
    );
};

/**
 * Type-safe wrapper around `useInfiniteQuery`, that enforces the query (and all the downstream dependencies)
 * are prefetched.
 *
 * Note that depending on how preloading is implemented (e.g. via {@link useNormalizedPrefetchInfiniteQuery}) the query
 * may still be in flight.
 *
 * @param linked - prefetched reference to query
 * @param options - Everything you usually provide to `useInfiniteQuery`, minus key + query + page params
 * @returns See [useInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useInfiniteQuery)
 */
export const useNormalizedPrefetchedInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = InfiniteData<TPropagatedData, TPageParam>,
>(
    linked:
        | Linked<
              TParams,
              TQueryKey,
              InfiniteData<TData, TPageParam>,
              Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>
          >
        | SkipToken
        | null
        | undefined,
    {
        select,
        ...options
    }: Omit<
        UseInfiniteQueryOptions<TData, unknown, TSelectedData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    > & {
        select?: (data: InfiniteData<TPropagatedData, TPageParam>) => TSelectedData;
    } = {}
): UseInfiniteQueryResult<TSelectedData, unknown> => {
    const disabled = !linked || linked === skipToken;

    return useInfiniteQuery(
        disabled
            ? {
                  queryKey: noopKey as unknown as TQueryKey,
                  queryFn: skipToken,
                  select: undefinedSelector as unknown as () => TSelectedData,
                  initialPageParam: null as unknown as TPageParam,
                  getNextPageParam: undefinedSelector,
                  getPreviousPageParam: undefinedSelector,
              }
            : {
                  ...options,
                  ...linked
                      .getQueryable()
                      .getUseInfiniteQueryOptions(linked.getQueryClient(), linked.getParams(), {
                          select,
                      }),
              },
        disabled ? getDummyQueryClient() : linked.getQueryClient()
    );
};

/**
 * Type-safe wrapper around `useSuspenseInfiniteQuery`.
 *
 * If data is expected to have been prefetched already, see {@link useNormalizedPrefetchedSuspenseInfiniteQuery}.
 *
 * @param inf - infinite instance
 * @param params - parameters to compute key+queryFn+pageParams. Can be provided manually, from a previous `populate`, or a `linked.getParams()`
 * @param options - Everything you usually provide to `useSuspenseInfiniteQuery`, minus key + query + page params
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns See [useSuspenseInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseInfiniteQuery)
 */
export const useNormalizedSuspenseInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = InfiniteData<TPropagatedData, TPageParam>,
>(
    inf: Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>,
    params: TParams,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseInfiniteQueryOptions<TData, unknown, TSelectedData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    > & {
        select?: (data: InfiniteData<TPropagatedData, TPageParam>) => TSelectedData;
    } = {},
    queryClient?: QueryClient
): UseSuspenseInfiniteQueryResult<TSelectedData, unknown> => {
    const qc = useQueryClient(queryClient);
    return useSuspenseInfiniteQuery(
        {
            ...options,
            ...inf.getUseSuspenseInfiniteQueryOptions(qc, params, { select }),
        },
        qc
    );
};

/**
 * Similar to {@link useNormalizedSuspenseInfiniteQuery}.
 *
 * Re-introduces`skipToken`. If provided in lieu of params, entire result is null.
 * Useful when data *should* be loaded, but might not exist at all.
 * e.g. Authors's books are loaded, or no author exist at all.
 *
 * If data is expected to have been prefetched already, see {@link useNormalizedNullablePrefetchedSuspenseInfiniteQuery}.
 *
 * @param inf - infinite instance
 * @param params - parameters to compute key+queryFn+pageParams. Can be provided manually, from a previous `populate`, or a `linked.getParams()` OR `skipToken`
 * @param options - Everything you usually provide to `useSuspenseInfiniteQuery`, minus key + query + page params
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns See [useSuspenseInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseInfiniteQuery)
 */
export const useNormalizedNullableSuspenseInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = InfiniteData<TPropagatedData, TPageParam>,
>(
    inf: Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>,
    params: SkipToken | TParams,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseInfiniteQueryOptions<TData, unknown, TSelectedData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    > & {
        select?: (data: InfiniteData<TPropagatedData, TPageParam>) => TSelectedData;
    } = {},
    queryClient?: QueryClient
): UseSuspenseInfiniteQueryResult<TSelectedData, unknown> | null => {
    const qc = useQueryClient(queryClient);

    const disabled = params === skipToken;

    const result = useSuspenseInfiniteQuery(
        disabled
            ? {
                  queryKey: noopKey as unknown as TQueryKey,
                  queryFn: undefinedSelector as unknown as () => TData,
                  select: undefinedSelector as unknown as () => TSelectedData,
                  initialPageParam: null as unknown as TPageParam,
                  getNextPageParam: undefinedSelector,
                  getPreviousPageParam: undefinedSelector,
              }
            : {
                  ...options,
                  ...inf.getUseSuspenseInfiniteQueryOptions(qc, params, { select }),
              },
        disabled ? getDummyQueryClient() : qc
    );
    return disabled ? null : result;
};

/**
 * Type-safe wrapper around `useSuspenseQuery`, that enforces the query (and all the downstream dependencies)
 * are prefetched.
 *
 * Note that depending on how preloading is implemented (e.g. via {@link useNormalizedPrefetchInfiniteQuery}) the query
 * may still be in flight.
 *
 * @param linked - prefetched reference to query
 * @param options - Everything you usually provide to `useSuspenseQuery`, minus key + query + page params
 * @returns See [useSuspenseInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseInfiniteQuery)
 */
export const useNormalizedPrefetchedSuspenseInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = InfiniteData<TPropagatedData, TPageParam>,
>(
    linked: Linked<
        TParams,
        TQueryKey,
        InfiniteData<TData, TPageParam>,
        Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>
    >,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseInfiniteQueryOptions<TData, unknown, TSelectedData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    > & {
        select?: (data: InfiniteData<TPropagatedData, TPageParam>) => TSelectedData;
    } = {}
): UseSuspenseInfiniteQueryResult<TSelectedData, unknown> =>
    useSuspenseInfiniteQuery(
        {
            ...options,
            ...linked
                .getQueryable()
                .getUseSuspenseInfiniteQueryOptions(linked.getQueryClient(), linked.getParams(), {
                    select,
                }),
        },
        linked.getQueryClient()
    );

/**
 * Similar to {@link useNormalizedPrefetchedSuspenseInfiniteQuery}.
 *
 * Re-introduces `skipToken`. If provided in lieu of resource, entire result is null.
 * Useful when data *should* be loaded, but might not exist at all.
 *
 * @param linked - prefetched reference to query
 * @param options - Everything you usually provide to `useSuspenseQuery`, minus key + query + page params
 * @returns See [useSuspenseInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useSuspenseInfiniteQuery)
 */
export const useNormalizedNullablePrefetchedSuspenseInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
    TSelectedData = InfiniteData<TPropagatedData, TPageParam>,
>(
    linked:
        | Linked<
              TParams,
              TQueryKey,
              InfiniteData<TData, TPageParam>,
              Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>
          >
        | SkipToken
        | null
        | undefined,
    {
        select,
        ...options
    }: Omit<
        UseSuspenseInfiniteQueryOptions<TData, unknown, TSelectedData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    > & {
        select?: (data: InfiniteData<TPropagatedData, TPageParam>) => TSelectedData;
    } = {}
): UseSuspenseInfiniteQueryResult<TSelectedData, unknown> | null => {
    const disabled = !linked || linked === skipToken;
    const result = useSuspenseInfiniteQuery(
        disabled
            ? {
                  queryKey: noopKey as unknown as TQueryKey,
                  queryFn: undefinedSelector as unknown as () => TData,
                  select: undefinedSelector as unknown as () => TSelectedData,
                  initialPageParam: null as unknown as TPageParam,
                  getNextPageParam: undefinedSelector,
                  getPreviousPageParam: undefinedSelector,
              }
            : {
                  ...options,
                  ...linked
                      .getQueryable()
                      .getUseSuspenseInfiniteQueryOptions(
                          linked.getQueryClient(),
                          linked.getParams(),
                          {
                              select,
                          }
                      ),
              },
        disabled ? getDummyQueryClient() : linked.getQueryClient()
    );
    return disabled ? null : result;
};

/**
 * Type-safe implementation of [usePrefetchInfiniteQuery](https://tanstack.com/query/latest/docs/framework/react/reference/usePrefetchQuery).
 *
 * @param inf - infinite instance
 * @param params - parameters to compute key+queryFn. Can be provided manually, from a previous `populate`, or a `linked.getParams()`
 * @param options - Everything you usually provide to `prefetchInfiniteQuery`, minus key + query + page params
 * @param queryClient - Instance of QueryClient to override value coming from context.
 * @returns A linked query that can be passed to `useNormalizePrefetchedInfinite...` hooks.
 */
export const useNormalizedPrefetchInfiniteQuery = <
    TParams,
    TPageParam,
    TData,
    TPropagatedData,
    TQueryKey extends readonly unknown[],
>(
    inf: Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>,
    params: TParams,
    options?: Omit<
        FetchInfiniteQueryOptions<TData, unknown, TData, TQueryKey, TPageParam>,
        OverriddenUseInfiniteQueryFields
    >,
    queryClient?: QueryClient
): Linked<
    TParams,
    TQueryKey,
    InfiniteData<TData, TPageParam>,
    Infinite<TParams, TPageParam, TData, TPropagatedData, TQueryKey>
> => {
    const qc = useQueryClient(queryClient);

    // Mirrors Tanstack implementation. Only loads initial time, does not "refresh".
    if (!inf.getQueryState(qc, params)) {
        void inf.prefetchInfiniteQuery(qc, params, options);
    }
    return new Linked(inf, params, qc);
};

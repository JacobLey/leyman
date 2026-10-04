import type {
    InfiniteData,
    InfiniteQueryExecuteOptions,
    QueryClient,
    QueryExecuteOptions,
    QueryFunctionContext,
} from '@tanstack/react-query';

export declare const typeCache: unique symbol;

export type QueryFunctionContextWithParams<
    TParams,
    TPageParam,
    TQueryKey extends readonly unknown[],
> = QueryFunctionContext<TQueryKey, TPageParam> & {
    params: TParams;
};

export type OverriddenQueryFilterFields = 'exact' | 'queryKey';

export type OverriddenUseQueryFields = 'queryFn' | 'queryKey' | 'select';

export type OverriddenUseInfiniteQueryFields =
    | 'getNextPageParam'
    | 'getPreviousPageParam'
    | 'initialPageParam'
    | 'queryFn'
    | 'queryKey'
    | 'select';

/**
 * Options for loading a resource with `queryClient.query`, minus the fields computed from params.
 *
 * @template TData - return type of base `queryFn`
 * @template TQueryKey - type of TanstackQuery key computed from params
 */
export type ResourceFetchOptions<TData, TQueryKey extends readonly unknown[]> = Omit<
    QueryExecuteOptions<TData, unknown, TData, TData, TQueryKey>,
    OverriddenUseQueryFields
>;

/**
 * {@link ResourceFetchOptions}, plus whether to refetch stale cached data in the background.
 *
 * @template TData - return type of base `queryFn`
 * @template TQueryKey - type of TanstackQuery key computed from params
 */
export type ResourceEnsureOptions<
    TData,
    TQueryKey extends readonly unknown[],
> = ResourceFetchOptions<TData, TQueryKey> & {
    revalidateIfStale?: boolean;
};

/**
 * {@link ResourceFetchOptions}, plus normalized-react-query's own options.
 *
 * @template TData - return type of base `queryFn`
 * @template TPropagatedData - data after propagation
 * @template TSelected - data after `select`
 * @template TQueryKey - type of TanstackQuery key computed from params
 */
export type ResourceQueryOptions<
    TData,
    TPropagatedData,
    TSelected,
    TQueryKey extends readonly unknown[],
> = ResourceFetchOptions<TData, TQueryKey> & {
    select?: ((data: TPropagatedData) => TSelected) | undefined;
    awaitLinks?: boolean | undefined;
};

/**
 * Options for loading an infinite query with `queryClient.infiniteQuery`, minus the fields computed from params.
 *
 * @template TData - return type of base `queryFn`
 * @template TQueryKey - type of TanstackQuery key computed from params
 * @template TPageParam - type of page params
 */
export type InfiniteFetchOptions<TData, TQueryKey extends readonly unknown[], TPageParam> = Omit<
    InfiniteQueryExecuteOptions<
        TData,
        unknown,
        InfiniteData<TData, TPageParam>,
        TQueryKey,
        TPageParam
    >,
    OverriddenUseInfiniteQueryFields
>;

/**
 * {@link InfiniteFetchOptions}, plus normalized-react-query's own options.
 *
 * @template TData - return type of base `queryFn`
 * @template TPropagatedData - data of each page after propagation
 * @template TSelected - data after `select`
 * @template TQueryKey - type of TanstackQuery key computed from params
 * @template TPageParam - type of page params
 */
export type InfiniteQueryOptions<
    TData,
    TPropagatedData,
    TSelected,
    TQueryKey extends readonly unknown[],
    TPageParam,
> = InfiniteFetchOptions<TData, TQueryKey, TPageParam> & {
    select?: ((data: InfiniteData<TPropagatedData, TPageParam>) => TSelected) | undefined;
    awaitLinks?: boolean | undefined;
};

/**
 * {@link InfiniteFetchOptions}, plus whether to refetch stale cached data in the background.
 *
 * @template TData - return type of base `queryFn`
 * @template TQueryKey - type of TanstackQuery key computed from params
 * @template TPageParam - type of page params
 */
export type InfiniteEnsureOptions<
    TData,
    TQueryKey extends readonly unknown[],
    TPageParam,
> = InfiniteFetchOptions<TData, TQueryKey, TPageParam> & {
    revalidateIfStale?: boolean;
};

export interface InfiniteSet<TData, TPageParam> {
    page: TData;
    pageParam: TPageParam;
}

export interface LinksActive {
    client: QueryClient;
    prefetches: Promise<unknown>[];
    revalidateIfStale: boolean;
}

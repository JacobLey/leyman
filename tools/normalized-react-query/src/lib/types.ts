import type { QueryClient, QueryFunctionContext } from '@tanstack/react-query';

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

export interface InfiniteSet<TData, TPageParam> {
    page: TData;
    pageParam: TPageParam;
}

export interface LinksActive {
    client: QueryClient;
    prefetches: Promise<unknown>[];
    revalidateIfStale: boolean;
}

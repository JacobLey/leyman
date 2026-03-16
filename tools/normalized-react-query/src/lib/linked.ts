import type { QueryClient } from '@tanstack/react-query';
import type { Queryable } from './queryable.js';
import type { LinksActive } from './types.js';

let linksActive: LinksActive | null = null;
export const setLinksActive = (val: typeof linksActive): void => {
    linksActive = val;
};
export const getLinksActive = (): typeof linksActive => linksActive;

/**
 * At a high level, just a combination of "queryable" + some params capable of
 * querying it.
 *
 * Existence of instances of this class are generally an indication that the
 * queryable has been "prefetched" with the provided params.
 *
 * Note that doesn't mean a value currently exists in cache (the request may still be in flight)
 * but encourages an optimized waterfall.
 *
 * By passing these instances to "prefetched" hooks, users should not only get better type
 * safety but overall performance improvements.
 *
 * @template TParams - User provided input for each query
 * @template TQueryKey - resulting TanstackQuery queryKey type from params
 * @template TData - type of data store in query cache
 * @template TQueryable - queryable instance
 */
export class Linked<
    TParams,
    TQueryKey extends readonly unknown[],
    TData,
    TQueryable extends Queryable<TParams, TQueryKey, TData>,
> {
    readonly #queryable: TQueryable;
    readonly #params: TParams;
    readonly #queryClient: QueryClient;

    public constructor(queryable: TQueryable, params: TParams, queryClient: QueryClient) {
        this.#queryable = queryable;
        this.#params = params;
        this.#queryClient = queryClient;
    }

    public getQueryable(): TQueryable {
        return this.#queryable;
    }

    public getParams(): TParams {
        return this.#params;
    }

    public getQueryClient(): QueryClient {
        return this.#queryClient;
    }
}

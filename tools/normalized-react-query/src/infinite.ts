import {
    hashQueryKey,
    useQueries,
    useQueryClient,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { useForceRerender } from './lib/hooks.js';
import type { DefaultPage, EmptyObject, PaginatedData, PaginatedParams } from './lib/types.js';
import { Paginated } from './paginated.js';

/**
 * Extension of `Paginated` class that uses paginated logic to provide "infinite" data.
 *
 * Attempts to mimic React Query's `useInfiniteQuery`. Note that hook is not used as
 * `queryKey` logic is not re-usable between `useQuery`.
 *
 * `Infinite` queries are built directly on top of `Paginated` queries, so it benefits from
 * any React Query caching and behavior.
 *
 * As well as implementation requirements from `Resource`, implementers should:
 * - optionally implement `getIdentifier`.
 */
export abstract class Infinite<
    Data,
    Params extends object = EmptyObject,
    Page = DefaultPage,
    Meta = EmptyObject,
> extends Paginated<Data, Params, Page, Meta> {
    /**
     * React Hook for "infinite" data loading.
     * Wraps `useQueries` in addition to extra methods to support pagination.
     *
     * @param input - method params defined by class, + options
     * @returns useQuery response.
     */
    public useInfinite(
        ...input:
            | [
                  Omit<PaginatedParams<Params, Page>, 'nextPage'>,
                  UseQueryOptions<PaginatedData<Data, Page, Meta>>,
              ]
            | [Omit<PaginatedParams<Params, Page>, 'nextPage'>]
            | (EmptyObject extends Params
                  ? [] | [null | undefined, UseQueryOptions<PaginatedData<Data, Page, Meta>>]
                  : never)
    ): Omit<UseQueryResult<PaginatedData<Data, Page, Meta>>, 'data'> & {
        lastData: UseQueryResult<PaginatedData<Data, Page, Meta>>['data'];
        data: Data[];
        allResults: UseQueryResult<PaginatedData<Data, Page, Meta>>[];
        hasNextPage: boolean;
        fetchNextPage: () => void;
    } {
        const [params = {}, options] = input;

        const defaultPageParams = {
            ...(params as PaginatedParams<Params, Page>),
            nextPage: null,
        };
        const defaultKey = this.getKey(defaultPageParams);

        const queryKeyHashFn = options?.queryKeyHashFn ?? hashQueryKey;

        // React Query's internal hashing method.
        // Assuming `getKey` is properly implemented, this string is a proxy
        // to check if `params` has changed in a meaningful way.
        const hashedDefaultKey = queryKeyHashFn(defaultKey);

        const client = useQueryClient();

        const forceRerender = useForceRerender();

        const [queries, appendQuery] = useMemo(() => {
            // Array of queries is initialized in a `useMemo` hook so it immediately reset on changed dependencies.
            const baseQueries: Required<
                Pick<
                    UseQueryOptions<PaginatedData<Data, Page, Meta>>,
                    'onError' | 'onSettled' | 'onSuccess' | 'queryFn' | 'queryHash' | 'queryKey'
                >
            >[] = [
                {
                    queryKey: defaultKey,
                    queryFn: async () => this.queryFn(defaultPageParams),
                    queryHash: hashedDefaultKey,
                    ...this.getHandlers(client, defaultPageParams),
                },
            ];
            const queryHashSet = new Set([hashedDefaultKey]);
            // Mutate array internally (so `useMemo` response stays "immutable")
            const appendToBaseQuery = (query: (typeof baseQueries)[number]): void => {
                if (!queryHashSet.has(query.queryHash)) {
                    // Only append if unique (dedupe `fetchNextPage` calls).
                    baseQueries.push(query);
                    queryHashSet.add(query.queryHash);
                    forceRerender();
                }
            };
            return [baseQueries, appendToBaseQuery];
        }, [hashedDefaultKey]);

        const results = useQueries({
            queries: queries.map(x => ({ ...x, ...options })),
        });

        const last = results.at(-1)!;

        // Pull individual `data` elements out of paginated responses.
        // Then dedupe based on identifier, favoring earlier appearance.
        const rawDatas = results
            .filter(
                (
                    x
                ): x is UseQueryResult<PaginatedData<Data, Page, Meta>> & {
                    isSuccess: true;
                } => x.isSuccess
            )
            .flatMap(x => x.data.data);
        const deduped: typeof rawDatas = [];
        const deduper = new Set<unknown>();
        for (const rawData of rawDatas) {
            const unique = this.getIdentifier(rawData);
            if (!deduper.has(unique)) {
                deduper.add(unique);
                deduped.push(rawData);
            }
        }

        const [hasNextPage, fetchNextPage] = useMemo(() => {
            if (last.isSuccess) {
                const { nextPage } = last.data;
                if (nextPage !== null) {
                    return [
                        true,
                        () => {
                            const nextPageParams = {
                                ...(params as PaginatedParams<Params, Page>),
                                nextPage,
                            };
                            const nextPageKey = this.getKey(nextPageParams);
                            appendQuery({
                                queryKey: nextPageKey,
                                queryFn: async () => this.queryFn(nextPageParams),
                                queryHash: queryKeyHashFn(nextPageKey),
                                ...this.getHandlers(client, nextPageParams),
                            });
                        },
                    ];
                }
            }
            return [false, () => {}];
        }, [client, hashedDefaultKey, last.isSuccess, last.data]);

        return {
            ...last,
            lastData: last.data,
            allResults: results,
            data: deduped,
            hasNextPage,
            fetchNextPage,
        };
    }

    /**
     * __MAY BE OVERRIDDEN BY CHILD CLASS__
     *
     * Return the minimal "identifier" to dedupe results across pages. Most likely an `id` attribute.
     *
     * Default behavior is to return an empty object, which is effectively unique.
     *
     * @param data - response from most recent data.
     * @returns if non-end there are more pages to load.
     */
    protected getIdentifier(data: Data): unknown;
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    protected getIdentifier(): unknown {
        return {};
    }
}

/**
 * Create a "infinitely paginating resource" without the class/instance syntax.
 *
 * See Infinite class for implementation details.
 *
 * @param params - required parameters
 * @param params.getKey - method to generated key based on parameters
 * @param params.queryFn - method that actually does data loading
 * @param [options] - optional
 * @param [options.onSuccess] - onSuccess handler
 * @param [options.onError] - onError handler
 * @param [options.onSettled] - onSettled handler
 * @param [options.getIdentifier] - custom get id
 * @returns typed infinite resource
 */
export const infinite = <
    Data,
    Params extends object = EmptyObject,
    Page = DefaultPage,
    Meta = EmptyObject,
>(
    params: {
        getKey: Infinite<Data, Params, Page, Meta>['getKey'];
        queryFn: Infinite<Data, Params, Page, Meta>['queryFn'];
    },
    options: {
        onSuccess?: Infinite<Data, Params, Page, Meta>['onSuccess'];
        onError?: Infinite<Data, Params, Page, Meta>['onError'];
        onSettled?: Infinite<Data, Params, Page, Meta>['onSettled'];
        getIdentifier?: Infinite<Data, Params, Page, Meta>['getIdentifier'];
    } = {}
): Infinite<Data, Params, Page, Meta> =>
    new (class extends Infinite<Data, Params, Page, Meta> {
        protected getKey = params.getKey;
        protected queryFn = params.queryFn;
        static {
            if (options.onSuccess) {
                this.prototype.onSuccess = options.onSuccess;
            }
            if (options.onError) {
                this.prototype.onError = options.onError;
            }
            if (options.onSettled) {
                this.prototype.onSettled = options.onSettled;
            }
            if (options.getIdentifier) {
                this.prototype.getIdentifier = options.getIdentifier;
            }
        }
    })();

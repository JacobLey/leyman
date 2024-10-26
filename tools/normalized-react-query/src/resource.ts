import {
    type FetchQueryOptions,
    hashQueryKey,
    type InvalidateOptions,
    type QueryClient,
    type QueryFilters,
    type QueryKey,
    type QueryStatus,
    type ResetOptions,
    type SetDataOptions,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type { DefaultParams, typeCache } from './lib/types.js';

declare const typeCached: typeof typeCache;

/**
 * Abstract class for data loading. Wrapper around React Query to enforce DRY code.
 *
 * All implementers should:
 * - Implement `getKey` method.
 * - Implement `queryFn` method
 * - Optionally implement handlers `onSuccess`, `onError`, and `onSettled`
 * - Create a single instance ("singleton") of class and export it.
 *
 * @template Data
 * @template Params
 */
export abstract class Resource<Data, Params = DefaultParams> {
    /**
     * Used to access type parameters.
     * See `QueryData` and `QueryParams`.
     *
     * __DO NOT USE__
     */
    public declare readonly [typeCached]: { data: Data; params: Params };

    /**
     * React Hook for data loading. Wrapper around `useQuery`.
     *
     * @param this - instance
     * @param params - method params defined by class.
     * @param [options] - passed to `useQuery` options.
     * @returns useQuery response.
     */
    public useQuery(
        this: this,
        params: Params,
        options?: UseQueryOptions<Data>
    ): UseQueryResult<Data> {
        // eslint-disable-next-line sonarjs/rules-of-hooks
        const client = useQueryClient();

        const queryKey = this.getKey(params);

        // eslint-disable-next-line sonarjs/rules-of-hooks
        const [queryFn, handlers] = useMemo(
            () => [async () => this.queryFn(params), this.getHandlers(client, params)],
            [hashQueryKey(queryKey)]
        );

        // eslint-disable-next-line sonarjs/rules-of-hooks
        return useQuery(queryKey, queryFn, {
            ...handlers,
            ...options,
        });
    }

    /**
     * `onSuccess` handler for queries.
     *
     * Default behavior is NOOP.
     *
     * @param client - query client
     * @param params - method params defined by class.
     * @param data - response from query.
     * @returns success handled
     */
    protected async onSuccess(client: QueryClient, params: Params, data: Data): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    protected async onSuccess(): Promise<void> {}

    /**
     * `onError` handler for queries.
     *
     * Default behavior is NOOP.
     *
     * @param client - query client
     * @param params - method params defined by class.
     * @param error - error from query.
     * @returns error handled
     */
    protected async onError(client: QueryClient, params: Params, error: unknown): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    protected async onError(): Promise<void> {}

    /**
     * `onSettled` handler for queries.
     *
     * Default behavior is NOOP.
     *
     * @param client - query client
     * @param params - method params defined by class.
     * @param data - response from query (if successful).
     * @param error - error from query (if error).
     * @returns settle handled
     */
    protected async onSettled(
        client: QueryClient,
        params: Params,
        data: Data | undefined,
        error?: unknown
    ): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/class-methods-use-this
    protected async onSettled(): Promise<void> {}

    /**
     * Create on* handlers given client+params input.
     *
     * @param client - query client
     * @param params - method params defined by class.
     * @returns on* handlers
     */
    protected getHandlers(
        client: QueryClient,
        params: Params
    ): Required<Pick<UseQueryOptions<Data>, 'onError' | 'onSettled' | 'onSuccess'>> {
        return {
            onSuccess: data => {
                void this.onSuccess(client, params, data);
            },
            onError: err => {
                void this.onError(client, params, err);
            },
            onSettled: (data, err) => {
                void this.onSettled(client, params, data, err);
            },
        };
    }

    /**
     * Wrapper around `fetchQuery`.
     * Can be used to `prefetchQuery` by ignoring result (what React Query does internally for prefetching).
     *
     * @param this - instance
     * @param client - query client
     * @param params - method params defined by class.
     * @param [options] - `prefetchQuery` options.
     * @returns data loaded by by `queryFn`
     */
    public async fetch(
        this: this,
        client: QueryClient,
        params: Params,
        options?: FetchQueryOptions<Data>
    ): Promise<Data> {
        let data: Data | undefined;
        let error: unknown;
        let called = false as boolean;
        try {
            data = await client.fetchQuery(
                this.getKey(params),
                async () => {
                    called = true;
                    return this.queryFn(params);
                },
                options
            );
            if (called) {
                await this.onSuccess(client, params, data);
            }
            return data;
        } catch (err) {
            error = err;
            await this.onError(client, params, err);
        } finally {
            if (called) {
                await this.onSettled(client, params, data, error);
            }
        }
        throw error;
    }

    /**
     * Wrapper around `getQueryData`.
     *
     * @param this - instance
     * @param client - query client
     * @param params - method params defined by class.
     * @param [filters] - query filters
     * @returns cached data (if exists)
     */
    public getData(
        this: this,
        client: QueryClient,
        params: Params,
        filters?: QueryFilters
    ): Data | undefined {
        return client.getQueryData(this.getKey(params), filters);
    }

    /**
     * Wrapper around `getQueryState`.
     *
     * @param this - instance
     * @param client - query client
     * @param params - method params defined by class.
     * @returns query status, null if not exists
     */
    public getStatus(this: this, client: QueryClient, params: Params): QueryStatus | null {
        const state = client.getQueryState(this.getKey(params));
        return state?.status ?? null;
    }

    /**
     * Wrapper around `setQueryData`.
     *
     * Will fire `onSuccess` and `onSettled` hooks as if query had just
     * successfully executed. Disable via `skipHooks = true`.
     *
     * @param this - instance
     * @param client - query client
     * @param params - method params defined by class.
     * @param data - data defined by class.
     * @param [options] - `setQueryData` options.
     */
    public async setData(
        this: this,
        client: QueryClient,
        params: Params,
        data: Data,
        options?: SetDataOptions & { skipHooks: boolean }
    ): Promise<void> {
        client.setQueryData(this.getKey(params), data, options);

        if (!options?.skipHooks) {
            await this.onSuccess(client, params, data);
            await this.onSettled(client, params, data);
        }
    }

    /**
     * Wrapper around `invalidateQueries`.
     *
     * @param this - instance
     * @param client - query client
     * @param params - method params defined by class.
     * @param [options] - `invalidateQueries` options.
     */
    public async invalidate(
        this: this,
        client: QueryClient,
        params: Params,
        options?: InvalidateOptions
    ): Promise<void> {
        await client.invalidateQueries<Data>(this.getKey(params), {}, options);
    }

    /**
     * Wrapper around `resetQueries`.
     *
     * @param this - instance
     * @param client - query client
     * @param params - method params defined by class.
     * @param [options] - `resetQueries` options.
     */
    public async reset(
        this: this,
        client: QueryClient,
        params: Params,
        options?: ResetOptions
    ): Promise<void> {
        await client.resetQueries<Data>(this.getKey(params), { exact: true }, options);
    }

    /**
     * __MUST BE IMPLEMENTED BY CHILD CLASS__
     *
     * Method to generate the `queryKey` for React Query.
     * Ideally is structured to match target API.
     *
     * Must generate a logically different key for different params
     * (and similarly the same key for logically similar params).
     *
     * @param {*} params - method params defined by class.
     * @returns {*[]} - query key array.
     */
    protected abstract getKey(params: Params): QueryKey;

    /**
     * __MUST BE IMPLEMENTED BY CHILD CLASS__
     *
     * `queryFn` that is called by React Query.
     * Any data loading and parsing should be implemented here.
     *
     * @param {*} params - method params defined by class.
     * @returns {Promise<*>} function that will be called by React Query for data loading.
     */
    protected abstract queryFn(params: Params): Promise<Data>;
}

/**
 * Create a "resource" without the class/instance syntax.
 *
 * See Resource class for implementation details.
 *
 * @param params - required parameters
 * @param params.getKey - get key based on parameters
 * @param params.queryFn - method that does actual data loading
 * @param [options] - optional
 * @param [options.onSuccess] - onSuccess handler
 * @param [options.onError] - onError handler
 * @param [options.onSettled] - onSettled handler
 * @returns typed resource
 */
export const resource = <Data, Params = DefaultParams>(
    params: {
        getKey: Resource<Data, Params>['getKey'];
        queryFn: Resource<Data, Params>['queryFn'];
    },
    options: {
        onSuccess?: Resource<Data, Params>['onSuccess'];
        onError?: Resource<Data, Params>['onError'];
        onSettled?: Resource<Data, Params>['onSettled'];
    } = {}
): Resource<Data, Params> => {
    /**
     * Instantiate child class of resource.
     */
    class ChildResource extends Resource<Data, Params> {
        protected getKey = params.getKey;
        protected queryFn = params.queryFn;
        public declare onSuccess;
        public declare onError;
        public declare onSettled;
    }
    if (options.onSuccess) {
        ChildResource.prototype.onSuccess = options.onSuccess;
    }
    if (options.onError) {
        ChildResource.prototype.onError = options.onError;
    }
    if (options.onSettled) {
        ChildResource.prototype.onSettled = options.onSettled;
    }
    return new ChildResource();
};

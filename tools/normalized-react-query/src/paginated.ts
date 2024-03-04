import type {
    DefaultPage,
    EmptyObject,
    PaginatedData,
    PaginatedParams,
} from './lib/types.js';
import { Resource, resource } from './resource.js';

/**
 * Typed wrapper around `Resource` class for data loading.
 * Ensures that results are returned as arrays, and respect pagination parameters.
 *
 * See `Resource` for implementation details.
 */
declare abstract class IPaginated<
    Data,
    Params extends object = EmptyObject,
    Page = DefaultPage,
    Meta = EmptyObject,
> extends Resource<
    PaginatedData<Data, Page, Meta>,
    PaginatedParams<Params, Page>
> {}
// eslint-disable-next-line @typescript-eslint/naming-convention
export const Paginated = Resource as typeof IPaginated;

/**
 * Typed wrapper around `resource`.
 *
 * See `resource` for implementation details.
 */
export const paginated = resource as <
    Data,
    Params extends object = EmptyObject,
    Page = DefaultPage,
    Meta = EmptyObject,
>(
    ...params: Parameters<
        typeof resource<
            PaginatedData<Data, Page, Meta>,
            PaginatedParams<Params, Page>
        >
    >
) => IPaginated<Data, Params, Page, Meta>;

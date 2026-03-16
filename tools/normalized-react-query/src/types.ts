import type { Linked } from './lib/linked.js';
import type { Queryable } from './lib/queryable.js';
import type { typeCache } from './lib/types.js';

type TypeCache<T extends Queryable<unknown, readonly unknown[], any>> = NonNullable<
    T[typeof typeCache]
>;

export type QueryParams<T extends Queryable<unknown, readonly unknown[], any>> =
    TypeCache<T>['params'];
export type QueryKey<T extends Queryable<unknown, readonly unknown[], any>> = TypeCache<T>['key'];
export type QueryData<T extends Queryable<unknown, readonly unknown[], any>> = TypeCache<T>['data'];

export type LinkOf<T extends Queryable<any, readonly any[], any>> = Linked<
    QueryParams<T>,
    QueryKey<T>,
    QueryData<T>,
    T
>;

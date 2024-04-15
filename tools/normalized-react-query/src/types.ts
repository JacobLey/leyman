import type { typeCache } from './lib/types.js';

export type { DefaultPage, DefaultParams, EmptyObject } from './lib/types.js';

export type QueryData<T extends { [typeCache]: { data: any } }> = T[typeof typeCache]['data'];
export type QueryParams<T extends { [typeCache]: { params: any } }> = T[typeof typeCache]['params'];
export type QueryVariables<T extends { [typeCache]: { variables: any } }> =
    T[typeof typeCache]['variables'];

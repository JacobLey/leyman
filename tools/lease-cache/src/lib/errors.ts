/**
 * Base of every error `lease-cache` throws.
 */
export abstract class LeaseCacheError extends Error {}

/**
 * A duration Valkey can't use: not a finite number, or not above 0 (`waitMs` and `staleMs` may be 0).
 */
export class LeaseCacheDurationError extends LeaseCacheError {
    public readonly option: string;
    public readonly value: number;
    public constructor(option: string, value: number) {
        super(`Invalid ${option}: ${value}`);
        this.name = 'LeaseCacheDurationError';
        this.option = option;
        this.value = value;
    }
}

/**
 * The loader returned something JSON can't store, e.g. `undefined`. Caching it would make every later read fail.
 */
export class LeaseCacheValueError extends LeaseCacheError {
    public readonly key: string;
    public constructor(key: string) {
        super(`Loaded value for ${JSON.stringify(key)} is not JSON`);
        this.name = 'LeaseCacheValueError';
        this.key = key;
    }
}

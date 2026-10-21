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
 * A prefix with `{`, which would change the hash tag that keeps a key's value, lease and stale value on one node of a
 * cluster.
 */
export class LeaseCachePrefixError extends LeaseCacheError {
    public readonly prefix: string;
    public constructor(prefix: string) {
        super(`Invalid prefix ${JSON.stringify(prefix)}: must not contain "{"`);
        this.name = 'LeaseCachePrefixError';
        this.prefix = prefix;
    }
}

/**
 * A key that is empty or starts with `}`. Its hash tag would be empty, so a cluster would spread its value, lease and
 * stale value across nodes, and every script on it would fail.
 */
export class LeaseCacheKeyError extends LeaseCacheError {
    public readonly key: string;
    public constructor(key: string) {
        super(`Invalid key ${JSON.stringify(key)}: must not be empty or start with "}"`);
        this.name = 'LeaseCacheKeyError';
        this.key = key;
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

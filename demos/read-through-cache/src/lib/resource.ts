import type { Json } from 'lease-cache';
import type { ReadThroughCache } from './cache.js';

export interface ResourceOptions<Input, T extends Json> {
    /**
     * The key of the value for an input. Every input that loads a different value must get a different key.
     */
    readonly key: (input: Input) => string;
    /**
     * Loads the value for an input from the source of truth.
     */
    readonly load: (input: Input) => Promise<T>;
    /**
     * How long a loaded value is cached, in place of the cache's `ttlMs`. A function gets the value and the input,
     * e.g. to cache a missing row for less time than a found one.
     */
    readonly ttlMs?: number | ((value: T, input: Input) => number);
}

/**
 * A kind of value in the cache, read by input rather than by key: the key and the loader are defined once, so a
 * key can never be read with a loader for something else.
 *
 * @template Input - What identifies a value, e.g. `{ id: number }`
 * @template T - The value
 */
export class Resource<Input, T extends Json> {
    readonly #cache: ReadThroughCache;
    readonly #options: ResourceOptions<Input, T>;

    /**
     * @param cache - Cache the values live in
     * @param options - Key, loader and TTL
     */
    public constructor(cache: ReadThroughCache, options: ResourceOptions<Input, T>) {
        this.#cache = cache;
        this.#options = options;
    }

    /**
     * Returns the cached value for an input, or loads and caches it.
     *
     * @param input - Identifies the value
     * @returns Cached or loaded value
     */
    public async get(input: Input): Promise<T> {
        const { key, load, ttlMs } = this.#options;
        return this.#cache.get(
            key(input),
            async () => load(input),
            ttlMs === undefined
                ? {}
                : { ttlMs: typeof ttlMs === 'function' ? value => ttlMs(value, input) : ttlMs }
        );
    }

    /**
     * Marks the value for an input stale (see `ReadThroughCache.expire`).
     *
     * @param input - Identifies the value
     */
    public async expire(input: Input): Promise<void> {
        await this.#cache.expire(this.#options.key(input));
    }

    /**
     * Deletes the value for an input, so the next read loads it.
     *
     * @param input - Identifies the value
     */
    public async invalidate(input: Input): Promise<void> {
        await this.#cache.invalidate(this.#options.key(input));
    }
}

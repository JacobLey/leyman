import type { Redis } from 'ioredis';
import type { Binding } from 'haywire';
import { bind, singletonScope } from 'haywire';
import { circuitBreakerId } from './ids.js';

/**
 * Thrown in place of a Valkey call while that node's breaker is open.
 */
export class ValkeyCircuitOpenError extends Error {
    public override readonly name = 'ValkeyCircuitOpenError';
}

/**
 * Skips a Valkey node for a while after it fails, so reads fail (or fall back) at once rather than each waiting
 * on a node that is down.
 */
export interface CircuitBreaker {
    /**
     * Called before a read or write.
     *
     * @param connection - The node's connection
     * @throws {ValkeyCircuitOpenError} While the node's breaker is open
     */
    readonly check: (connection: Redis) => void;
    /**
     * Called when a call to the node fails, opening its breaker. Has no effect while it's already open, so failures
     * that were already on their way don't keep it open longer.
     *
     * @param connection - The node's connection
     */
    readonly failed: (connection: Redis) => void;
}

export interface CircuitBreakerOptions {
    /**
     * How long a node is skipped after it fails, in milliseconds. The first call after that tries it again, and
     * opens the breaker for as long again if it fails.
     */
    readonly breakMs: number;
    /**
     * The current time in milliseconds, `Date.now` by default. Tests pass their own, to reopen a node without
     * waiting.
     */
    readonly now?: () => number;
}

/**
 * Every call goes to Valkey, however recently it failed.
 */
export const noCircuitBreaker: CircuitBreaker = {
    check: () => {},
    failed: () => {},
};

/**
 * Every call goes to Valkey, however recently it failed.
 */
export const noCircuitBreakerBinding = bind(circuitBreakerId).withInstance(noCircuitBreaker);

/**
 * One breaker per node, so a node that is down doesn't stop reads of keys on the others.
 *
 * @param options - How long a failed node is skipped, and the clock
 * @returns Breaker over every node
 */
const nodeCircuitBreaker = ({ breakMs, now = Date.now }: CircuitBreakerOptions): CircuitBreaker => {
    // When each node's breaker closes. Keyed weakly, so nodes closed by a resize are dropped with them.
    const closesAt = new WeakMap<Redis, number>();
    const isOpen = (connection: Redis): boolean => now() < (closesAt.get(connection) ?? 0);
    return {
        check: connection => {
            if (isOpen(connection)) {
                throw new ValkeyCircuitOpenError(
                    `Valkey node skipped for ${breakMs}ms after it failed`
                );
            }
        },
        failed: connection => {
            if (!isOpen(connection)) {
                closesAt.set(connection, now() + breakMs);
            }
        },
    };
};

/**
 * Skips each Valkey node for `breakMs` after it fails. Reads and writes fail at once while it's skipped, with
 * `ValkeyCircuitOpenError`, which a memory tier (with BentoCache's own tier) or a `fallback` (with lease-cache)
 * reads past like any other Valkey error. Invalidations are tried anyway: one skipped while the node is back
 * would leave a changed value cached.
 *
 * Each container gets its own breakers, as each process sees failures for itself.
 *
 * @param options - How long a failed node is skipped, and the clock
 * @returns Binding for `circuitBreakerId`
 */
export const circuitBreakerBinding = (
    options: CircuitBreakerOptions
): Binding<typeof circuitBreakerId, [], false> =>
    bind(circuitBreakerId)
        .withDependencies([])
        .withProvider(() => nodeCircuitBreaker(options))
        .scoped(singletonScope);

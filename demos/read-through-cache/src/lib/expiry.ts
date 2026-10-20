import type { Binding } from 'haywire';
import { bind } from 'haywire';
import { expiryPolicyId } from './ids.js';

export interface StaleWhileRevalidateOptions {
    /**
     * How long values are kept, from when they were loaded (so longer than `ttlMs`).
     */
    readonly graceMs: number;
}

/**
 * Expired values are gone: the next read waits for the loader.
 */
export const waitForFreshBinding = bind(expiryPolicyId).withInstance({ graceMs: false });

/**
 * Keep values for `graceMs`, and once they expire, return the stale value immediately while loading a fresh one
 * in the background. Also serves the stale value when loading fails.
 *
 * @param options - How long to keep values
 * @returns Binding for `expiryPolicyId`
 */
export const staleWhileRevalidateBinding = (
    options: StaleWhileRevalidateOptions
): Binding<typeof expiryPolicyId, [], false> =>
    bind(expiryPolicyId).withInstance({ graceMs: options.graceMs });

import type { DeferredPromise } from 'p-defer';
import pDefer from 'p-defer';

export interface ControlledLoader<T> {
    /**
     * Pass as the loader. Each call stays pending until the test settles it.
     */
    readonly load: () => Promise<T>;
    /**
     * Number of calls so far.
     */
    readonly calls: () => number;
    /**
     * Resolves once the `n`th call (from 1) is made.
     */
    readonly called: (n: number) => Promise<void>;
    /**
     * Waits for the `n`th call, then resolves it with `value`.
     */
    readonly resolve: (n: number, value: T) => Promise<void>;
    /**
     * Waits for the `n`th call, then rejects it with `error`.
     */
    readonly reject: (n: number, error: Error) => Promise<void>;
}

/**
 * A loader the test settles by hand, so tests order events directly rather than waiting on time.
 *
 * @returns Loader, and controls for its calls
 */
export const controlledLoader = <T>(): ControlledLoader<T> => {
    const calls = new Map<number, DeferredPromise<DeferredPromise<T>>>();
    let count = 0;

    const nthCall = (n: number): DeferredPromise<DeferredPromise<T>> => {
        let call = calls.get(n);
        if (!call) {
            call = pDefer();
            calls.set(n, call);
        }
        return call;
    };

    return {
        load: async () => {
            const result = pDefer<T>();
            count++;
            nthCall(count).resolve(result);
            return result.promise;
        },
        calls: () => count,
        called: async n => {
            await nthCall(n).promise;
        },
        resolve: async (n, value) => {
            const result = await nthCall(n).promise;
            result.resolve(value);
        },
        reject: async (n, error) => {
            const result = await nthCall(n).promise;
            result.reject(error);
        },
    };
};

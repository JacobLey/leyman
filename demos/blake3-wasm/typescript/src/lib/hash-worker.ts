import type { Endpoint } from 'comlink';
import { transfer, wrap } from 'comlink';

/**
 * What a worker exposes, through Comlink.
 */
export interface WorkerApi {
    hash: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array;
}

/**
 * Options for {@link HashWorker.hash}.
 */
export interface HashOptions {
    /**
     * Move the bytes' whole `ArrayBuffer` to the worker rather than copy it, leaving it empty here. Copying adds up to
     * 60% to hashing 16 MiB, part of it on the calling thread.
     *
     * @default false
     */
    readonly transfer?: boolean;
}

/**
 * Hashes on a thread of its own, leaving the calling thread free.
 *
 * Starting one takes 4 to 18 ms, so keep it rather than start one per call. Calls run one at a time, in order.
 * If the worker itself dies, a pending call never settles: hashing doesn't throw, so that takes something like running
 * out of memory.
 */
export interface HashWorker extends AsyncDisposable {
    /**
     * The BLAKE3 hash of some bytes.
     *
     * @param bytes - to hash
     * @param [options] - optional
     * @returns 32 bytes
     */
    hash: (bytes: Uint8Array<ArrayBuffer>, options?: HashOptions) => Promise<Uint8Array>;
    /**
     * Stops the worker. Pending calls never settle.
     */
    close: () => Promise<void>;
}

/**
 * The calling thread's side of a worker, on any platform.
 *
 * @param endpoint - what Comlink sends messages through
 * @param terminate - stops the worker
 * @returns what to hash through, and close
 */
export const wrapHashWorker = (endpoint: Endpoint, terminate: () => unknown): HashWorker => {
    const remote = wrap<WorkerApi>(endpoint);
    const close = async (): Promise<void> => {
        await terminate();
    };
    return {
        close,
        hash: async (bytes, options) =>
            remote.hash(options?.transfer === true ? transfer(bytes, [bytes.buffer]) : bytes),
        [Symbol.asyncDispose]: close,
    };
};

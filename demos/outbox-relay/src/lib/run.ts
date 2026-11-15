import type { Client } from 'pg';
import type { RelayOptions, RelayResult } from './relay.js';
import { maxBatch, relayOnce } from './relay.js';

/**
 * The channel `outbox_ring()` in `schema.sql` notifies.
 */
const channel = 'outbox';

const defaultPollMs = 5000;

/**
 * Options for {@link startRelay}.
 */
export interface StartRelayOptions extends RelayOptions {
    /**
     * A connected client of its own, which the relay `LISTEN`s on. The caller owns it: it handles its errors and ends
     * it after closing the relay. If it dies, polling still delivers.
     */
    readonly listener: Client;
    /**
     * How often to look for rows without a ring: lost rings, expired leases and retries that came due.
     *
     * @default 5000
     */
    readonly pollMs?: number;
    /**
     * Called with each drain that fails, e.g. on a network error. Its rows come back when their lease expires.
     * Required, so a relay that keeps failing is never silent.
     */
    readonly onError: (error: unknown) => void;
}

/**
 * A running relay.
 */
export interface Relay extends AsyncDisposable {
    /**
     * Stops waking, and waits for a drain in progress to finish.
     */
    readonly close: () => Promise<void>;
}

/**
 * Starts relaying: once now, again on each ring of the doorbell, and every `pollMs` as the fallback. Each wake drains
 * the outbox, passing until one claims fewer than 10 rows. Wakes during a drain run one more drain after it, so a row
 * committed mid-drain isn't left for the next poll.
 *
 * Several relays can run against one outbox: claims never overlap.
 *
 * @param options - Outbox, client, bus and listener
 * @returns Relay, to close
 */
export const startRelay = async ({
    listener,
    pollMs = defaultPollMs,
    onError,
    ...relayOptions
}: StartRelayOptions): Promise<Relay> => {
    let running: Promise<void> | null = null;
    // Set by every wake, and cleared by the drain it starts: one that arrives mid-drain makes the loop drain again
    let hasPendingWake = false;

    const drain = async (): Promise<void> => {
        let result: RelayResult;
        do {
            result = await relayOnce(relayOptions);
        } while (result.sent.length + result.retried.length + result.parked.length === maxBatch);
    };
    const wake = (): void => {
        hasPendingWake = true;
        running ??= (async () => {
            while (hasPendingWake) {
                hasPendingWake = false;
                try {
                    await drain();
                } catch (error) {
                    onError(error);
                }
            }
            running = null;
        })();
    };

    const onNotification = ({ channel: notified }: { readonly channel: string }): void => {
        if (notified === channel) {
            wake();
        }
    };
    listener.on('notification', onNotification);
    await listener.query(`LISTEN ${channel}`);
    const timer = setInterval(wake, pollMs);
    wake();

    const close = async (): Promise<void> => {
        clearInterval(timer);
        listener.off('notification', onNotification);
        await running;
    };
    return { close, [Symbol.asyncDispose]: close };
};

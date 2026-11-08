import type { IdempotencyNotifier } from './listeners.js';
import { Listeners } from './listeners.js';

/**
 * The one command needed to publish. An ioredis `Redis` fits as is.
 */
export interface ValkeyPublisher {
    publish: (channel: string, message: string) => Promise<unknown>;
}

/**
 * What is needed from a connection in subscriber mode, which can run nothing else. An ioredis `Redis` fits as is,
 * and subscribes again by itself when it reconnects.
 */
export interface ValkeySubscriber {
    subscribe: (channel: string) => Promise<unknown>;
    unsubscribe: (channel: string) => Promise<unknown>;
    on: (event: 'message', listener: (channel: string, message: string) => void) => unknown;
    off: (event: 'message', listener: (channel: string, message: string) => void) => unknown;
}

export interface ValkeyNotifierOptions {
    /**
     * Connection to publish on. Any connection, such as the store's.
     */
    readonly publisher: ValkeyPublisher;
    /**
     * A connection of its own, as subscribing takes it over. The notifier never closes either connection.
     */
    readonly subscriber: ValkeySubscriber;
    /**
     * Channel every server shares. Defaults to `idempotency_keys`.
     */
    readonly channel?: string;
}

/**
 * Notifies through Valkey (or Redis) pub/sub: `PUBLISH <channel> <identity>`. One subscription serves every waiting
 * request of the process. Works with either store.
 */
export class ValkeyNotifier implements IdempotencyNotifier {
    readonly #publisher: ValkeyPublisher;
    readonly #subscriber: ValkeySubscriber;
    readonly #channel: string;
    readonly #listeners = new Listeners();
    readonly #onMessage: (channel: string, message: string) => void;

    private constructor({
        publisher,
        subscriber,
        channel = 'idempotency_keys',
    }: ValkeyNotifierOptions) {
        this.#publisher = publisher;
        this.#subscriber = subscriber;
        this.#channel = channel;
        this.#onMessage = (messageChannel, message) => {
            if (messageChannel === channel) {
                this.#listeners.dispatch(message);
            }
        };
    }

    /**
     * Subscribes to the channel, resolving once Valkey confirms it.
     *
     * @param options - Connections and channel
     * @returns Subscribed notifier
     */
    public static async listen(options: ValkeyNotifierOptions): Promise<ValkeyNotifier> {
        const notifier = new ValkeyNotifier(options);
        notifier.#subscriber.on('message', notifier.#onMessage);
        await notifier.#subscriber.subscribe(notifier.#channel);
        return notifier;
    }

    public async publish(identity: string): Promise<void> {
        await this.#publisher.publish(this.#channel, identity);
    }

    public subscribe(identity: string, listener: () => void): () => void {
        return this.#listeners.subscribe(identity, listener);
    }

    /**
     * Unsubscribes from the channel. Waiting requests go on polling.
     */
    public async close(): Promise<void> {
        this.#subscriber.off('message', this.#onMessage);
        await this.#subscriber.unsubscribe(this.#channel);
    }
}

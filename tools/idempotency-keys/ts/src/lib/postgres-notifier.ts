import type { IdempotencyNotifier } from './listeners.js';
import type { PostgresQueryable } from './postgres-store.js';
import { quoteIdentifier } from './identifier.js';
import { Listeners } from './listeners.js';

/**
 * A notification, as `pg` emits it.
 */
export interface PostgresNotification {
    readonly channel: string;
    /**
     * The message. `pg` always gives one, empty when sent without one.
     */
    readonly payload?: string | undefined;
}

/**
 * What is needed from the connection that listens. A `pg` `Client` fits as is; a pool doesn't, since `LISTEN`
 * belongs to one connection.
 */
export interface PostgresListener {
    query: (text: string) => Promise<unknown>;
    on: ((
        event: 'notification',
        listener: (notification: PostgresNotification) => void
    ) => unknown) &
        ((event: 'error', listener: (error: Error) => void) => unknown);
    off: ((
        event: 'notification',
        listener: (notification: PostgresNotification) => void
    ) => unknown) &
        ((event: 'error', listener: (error: Error) => void) => unknown);
}

export interface PostgresNotifierOptions {
    /**
     * Client to notify on, such as the store's pool.
     */
    readonly publisher: PostgresQueryable;
    /**
     * A connection of its own, which stays open to listen. The notifier never closes either. `pg` doesn't
     * reconnect a client that fails: the notifier reports the error to `onError`, and waiting requests then only
     * poll. To get notifications again, listen with a new client.
     */
    readonly listener: PostgresListener;
    /**
     * Called when the listening connection fails (Postgres restarted, or ended it), rather than letting `pg` throw
     * its `error` event and crash the process. `pg` may report one failure more than once. Ignored by default.
     */
    readonly onError?: (error: Error) => void;
    /**
     * Channel every server shares. Defaults to `idempotency_keys`.
     */
    readonly channel?: string;
}

/**
 * Notifies through Postgres: `SELECT pg_notify(<channel>, <identity>)`, heard with `LISTEN`. One listening connection
 * serves every waiting request of the process. Works with either store.
 */
export class PostgresNotifier implements IdempotencyNotifier {
    readonly #publisher: PostgresQueryable;
    readonly #listener: PostgresListener;
    readonly #channel: string;
    readonly #quotedChannel: string;
    readonly #listeners = new Listeners();
    readonly #onNotification: (notification: PostgresNotification) => void;
    readonly #onError: (error: Error) => void;
    #hasFailed = false;

    private constructor({
        publisher,
        listener,
        channel = 'idempotency_keys',
        onError = () => {},
    }: PostgresNotifierOptions) {
        this.#publisher = publisher;
        this.#listener = listener;
        this.#channel = channel;
        // `LISTEN` takes an identifier, quoted so it matches `pg_notify`'s channel exactly, case included
        this.#quotedChannel = quoteIdentifier('channel', channel);
        this.#onError = error => {
            this.#hasFailed = true;
            onError(error);
        };
        this.#onNotification = ({ channel: notificationChannel, payload }) => {
            if (notificationChannel === channel) {
                this.#listeners.dispatch(payload!);
            }
        };
    }

    /**
     * Listens on the channel, resolving once Postgres confirms it.
     *
     * @param options - Connections and channel
     * @returns Listening notifier
     */
    public static async listen(options: PostgresNotifierOptions): Promise<PostgresNotifier> {
        const notifier = new PostgresNotifier(options);
        notifier.#listener.on('notification', notifier.#onNotification);
        notifier.#listener.on('error', notifier.#onError);
        await notifier.#listener.query(`LISTEN ${notifier.#quotedChannel}`);
        return notifier;
    }

    public async publish(identity: string): Promise<void> {
        await this.#publisher.query('SELECT pg_notify($1, $2)', [this.#channel, identity]);
    }

    public subscribe(identity: string, listener: () => void): () => void {
        return this.#listeners.subscribe(identity, listener);
    }

    /**
     * Stops listening. Waiting requests go on polling. After the connection failed, it only stops dispatching: `pg`
     * may emit more errors for the dead client, which stay reported to `onError` rather than crash the process.
     */
    public async close(): Promise<void> {
        this.#listener.off('notification', this.#onNotification);
        if (this.#hasFailed) {
            return;
        }
        this.#listener.off('error', this.#onError);
        await this.#listener.query(`UNLISTEN ${this.#quotedChannel}`);
    }
}

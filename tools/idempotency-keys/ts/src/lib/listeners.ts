/**
 * Where to tell other servers that an identity's record changed, so their waiting requests claim again sooner.
 * Only an optimization: waiting requests poll the store regardless.
 */
export interface IdempotencyNotifier {
    /**
     * Announces that an identity's record was completed or released.
     */
    readonly publish: (identity: string) => Promise<void>;
    /**
     * Calls `listener` whenever an identity's record is announced, until the returned function is called.
     */
    readonly subscribe: (identity: string, listener: () => void) => () => void;
}

/**
 * The requests waiting on each identity in this process, so one subscription to the channel serves them all.
 */
export class Listeners {
    readonly #listeners = new Map<string, Set<() => void>>();

    /**
     * Calls `listener` whenever `identity` is dispatched, until the returned function is called.
     *
     * @param identity - Identity to listen for
     * @param listener - Called on each dispatch
     * @returns Stops listening
     */
    public subscribe(identity: string, listener: () => void): () => void {
        let set = this.#listeners.get(identity);
        if (!set) {
            set = new Set();
            this.#listeners.set(identity, set);
        }
        // Wrapped, so subscribing one function twice gives two subscriptions that end separately
        const entry = (): void => {
            listener();
        };
        set.add(entry);
        return () => {
            set.delete(entry);
            if (set.size === 0 && this.#listeners.get(identity) === set) {
                this.#listeners.delete(identity);
            }
        };
    }

    /**
     * Wakes every listener of an identity.
     *
     * @param identity - The message heard on the channel
     */
    public dispatch(identity: string): void {
        const set = this.#listeners.get(identity);
        if (set) {
            for (const listener of set) {
                listener();
            }
        }
    }
}

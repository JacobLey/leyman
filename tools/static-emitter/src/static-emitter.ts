import type * as Types from './lib/types.js';
import { StaticEventTarget } from './static-event-target.js';
import { TypedCustomEvent } from './typed-custom-event.js';

/**
 * Options for `StaticEmitter` subscriptions.
 */
export interface SubscribeOptions {
    /**
     * Removes the listener when aborted.
     */
    signal?: AbortSignal;
}

/**
 * `StaticEventTarget` with helpers that wrap and unwrap the `detail` of `TypedCustomEvent`s.
 *
 * Still a native `EventTarget`, so listener errors are reported (not thrown by `emit()`)
 * and native methods remain available for `Event` subclasses.
 *
 * @example
 * const emitter = new StaticEmitter<{ data: string }>();
 * const unsubscribe = emitter.on('data', value => console.log(value));
 * emitter.emit('data', 'hello');
 * unsubscribe();
 *
 * @template Events map of event name to event or detail
 */
export class StaticEmitter<
    Events extends Types.EventMap = Types.NoEvents,
> extends StaticEventTarget<Events> {
    /**
     * Listen to an event's detail.
     *
     * Every call registers a new listener, even when `listener` is already registered.
     *
     * @param type - event name
     * @param listener - called with the detail and event
     * @param options - subscription options
     * @returns function that removes the listener
     */
    public on<K extends Types.DetailEventName<Events>>(
        type: K,
        listener: Types.DetailListener<Events, K>,
        options?: SubscribeOptions & { once?: boolean }
    ): () => void {
        const wrapped = (event: TypedCustomEvent<K, Events[K]>): void => {
            listener(event.detail, event);
        };
        // `K` is a detail event, so its event is a `TypedCustomEvent`, which TS can't resolve generically.
        const nativeListener = wrapped as unknown as Types.TypedEventListener<Events, K>;
        this.addEventListener(type, nativeListener, options);
        return () => {
            this.removeEventListener(type, nativeListener);
        };
    }

    /**
     * Listen to the next occurrence of an event's detail.
     *
     * @param type - event name
     * @param listener - called with the detail and event
     * @param options - subscription options
     * @returns function that removes the listener
     */
    public once<K extends Types.DetailEventName<Events>>(
        type: K,
        listener: Types.DetailListener<Events, K>,
        options?: SubscribeOptions
    ): () => void {
        return this.on(type, listener, { ...options, once: true });
    }

    /**
     * Resolves with the detail of the next occurrence of an event.
     *
     * @param type - event name
     * @param options - subscription options
     * @returns detail of the next event, or rejection with the signal's reason if aborted first
     */
    public async next<K extends Types.DetailEventName<Events>>(
        type: K,
        options?: SubscribeOptions
    ): Promise<Events[K]> {
        const signal = options?.signal;
        return new Promise((resolve, reject) => {
            signal?.throwIfAborted();
            const onAbort = (): void => {
                // Mirror native abort behavior, which rejects with the signal's (any) reason.
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                reject(signal?.reason);
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            this.once(
                type,
                detail => {
                    signal?.removeEventListener('abort', onAbort);
                    resolve(detail);
                },
                options
            );
        });
    }

    /**
     * Dispatches a `TypedCustomEvent` with the detail.
     *
     * The detail may be omitted when it accepts `undefined`.
     *
     * @param type - event name
     * @param args - event data, optional when it accepts `undefined`
     */
    public emit<K extends Types.DetailEventName<Events>>(
        type: K,
        ...args: undefined extends Events[K] ? [detail?: Events[K]] : [detail: Events[K]]
    ): void {
        const [detail] = args;
        // Constructor's conditional parameters can't be resolved generically.
        const event = new TypedCustomEvent<K, unknown>(type, { detail });
        this.dispatchEvent(event as unknown as Types.AnyEventOf<Events>);
    }
}

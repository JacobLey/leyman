import CustomEvent from '#custom-event';
import { StaticEventTarget } from '#static-event-target';
import type * as Types from './lib/types.js';

/**
 * Wrapper around EventTarget to provide static typing to events
 * rather than the dreaded `any[]`. Types override native `addListener`/`dispatch` methods,
 * as well as implement strongly typed `on`/`emit` methods similar to NodeJS.
 *
 * Declare events via `events` symbol (type-only) in format `{ eventName: [args] }`
 *
 * @example
 * import { type events, StaticEmitter } from 'static-emitter';
 *
 * class MyEmitter extends StaticEmitter {
 *     declare public [events]: {
 *         foo: [boolean, number[]];
 *         bar: [string];
 *     }
 * }
 *
 * const myEmitter = new MyEmitter();
 * myEmitter.on('foo', (bool, nums) => {
 *     console.log(bool); // typed as `boolean`
 *     console.log(nums); // typed as `number`
 * });
 * myEmitter.emit('foo', true, [123]); // success!
 *
 * myEmitter.emit('bar', { wrong: null }); // Typescript error!
 */
export class StaticEmitter<
    InterfaceEvents extends Types.EventDict = Types.EmptyObject,
> extends StaticEventTarget<InterfaceEvents> {
    #eventNameId = 0;
    readonly #wrappedListeners = new WeakMap<
        Types.CustomEventListener<this, Types.CustomEventList<this>>,
        Types.EventTargetListener<Types.IEmitter, string>
    >();
    readonly #eventMap = new Map<Types.CustomEventList<this>, string>();

    // Alias for custom methods, attached via prototype.

    /**
     * Alias for `on()`.
     */
    public declare addListener: this['on'];

    /**
     * Alias for `off()`.
     */
    public declare removeListener: this['off'];

    // Custom methods, mirroring EventEmitter syntax + simplifying CustomEvent + allowing symbols.

    /**
     * Mirror EventEmitter syntax. Wraps event data in CustomEvent.
     *
     * @param eventName - event name used as key
     * @param listener - callback that is called on event
     * @returns this static emitter
     */
    public on<K extends Types.CustomEventList<this>>(
        eventName: K,
        listener: Types.CustomEventListener<this, K>
    ): this {
        this.addEventListener(
            this.#getEventName(eventName) as Types.EventList<this>,
            this.#getListener(listener)
        );
        return this;
    }

    /**
     * Mirror EventEmitter syntax. Wraps event data in CustomEvent.
     *
     * Will remove listener after first invocation.
     *
     * @param eventName - event name used as key
     * @param listener - callback that is called on event
     * @returns this static emitter
     */
    public once<K extends Types.CustomEventList<this>>(
        eventName: K,
        listener: Types.CustomEventListener<this, K>
    ): this {
        this.addEventListener(
            this.#getEventName(eventName) as Types.EventList<this>,
            this.#getListener(listener),
            { once: true }
        );
        return this;
    }

    /**
     * Mirror EventEmitter syntax.
     *
     * Removes listener from emitter. Allows both "native" listeners and static emitter wrappers.
     *
     * @param eventName - event name used as key
     * @param listener - callback to remove
     * @returns this static emitter
     */
    public off<K extends Types.CustomEventList<this> | Types.EventList<this>>(
        eventName: K,
        listener:
            | (K extends Types.CustomEventList<this> ? Types.CustomEventListener<this, K> : never)
            | (K extends Types.EventList<this> ? Types.EventTargetListener<this, K> : never)
    ): this {
        this.removeEventListener(
            this.#getEventName(eventName as Types.CustomEventList<this>) as Types.EventList<this>,
            this.#wrappedListeners.get(
                listener as Types.CustomEventListener<this, Types.CustomEventList<this>>
            ) ?? (listener as Types.NullishEventTargetListener<this, Types.EventList<this>>)
        );
        return this;
    }

    /**
     * Mirror EventEmitter syntax.
     *
     * Emit event + detail.
     *
     * @param eventName - event name used as key
     * @param detail - event data
     * @returns this static emitter
     */
    public emit<K extends Types.CustomEventList<this>>(
        eventName: K,
        detail: Types.GetEventDetail<this, K>
    ): this {
        this.dispatchEvent(
            new CustomEvent(this.#getEventName(eventName), { detail } as {
                detail: unknown;
            }) as Types.EventListenerParam<this, Types.EventList<this>>
        );
        return this;
    }

    /**
     * Maps `symbol` and `number` events to a random string for native support.
     * Caches mapping for future consistency.
     *
     * @param eventName - event name used as key
     * @returns EventTarget compliant event name
     */
    #getEventName(eventName: Types.CustomEventList<this>): string {
        if (typeof eventName === 'string') {
            return eventName;
        }
        const existingName = this.#eventMap.get(eventName);
        if (existingName) {
            return existingName;
        }
        const randomName = `STATIC-EMITTER-${Math.random()}-${this.#eventNameId++}`;
        this.#eventMap.set(eventName, randomName);
        return randomName;
    }

    /**
     * Wraps a listener method provided by client with an EventTarget compatible
     * emitter using CustomEvent.
     *
     * Caches result in a WeakMap for future references and automatic cleanup.
     *
     * @param listener - user provided listener
     * @returns EventTarget listener
     */
    #getListener<K extends Types.CustomEventList<this>>(
        listener: Types.CustomEventListener<this, K>
    ): Types.EventTargetListener<Types.IEmitter, string> {
        const existingWrapped = this.#wrappedListeners.get(
            listener as unknown as Types.CustomEventListener<this, Types.CustomEventList<this>>
        );

        if (existingWrapped) {
            return existingWrapped;
        }

        const wrapped = (customEvent: Types.EventType<K, Types.GetEventDetail<this, K>>): void => {
            listener(
                (customEvent as CustomEvent<string, Types.GetEventDetail<this, K>>).detail,
                customEvent
            );
        };
        this.#wrappedListeners.set(
            listener as unknown as Types.CustomEventListener<this, Types.CustomEventList<this>>,
            wrapped as Types.EventTargetListener<Types.IEmitter, string>
        );
        return wrapped as Types.EventTargetListener<Types.IEmitter, string>;
    }
}

// eslint-disable-next-line @typescript-eslint/unbound-method
StaticEmitter.prototype.addListener = StaticEmitter.prototype.on;
// eslint-disable-next-line @typescript-eslint/unbound-method
StaticEmitter.prototype.removeListener = StaticEmitter.prototype.off;

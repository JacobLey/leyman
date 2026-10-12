import type * as Types from './lib/types.js';

/**
 * `EventTarget` that only accepts declared events.
 *
 * Events are declared as a map of event name to either an `Event` subclass, or a detail value
 * that is dispatched as a `TypedCustomEvent`.
 *
 * @template Events map of event name to event or detail
 */
export class StaticEventTarget<Events extends Types.EventMap = Types.NoEvents> extends EventTarget {
    /**
     * Typed `EventTarget.addEventListener`.
     *
     * @param type - event name
     * @param listener - callback or `handleEvent` object
     * @param options - native listener options
     */
    public override addEventListener<K extends Types.EventName<Events>>(
        type: K,
        listener: Types.TypedEventListener<Events, K> | null,
        options?: boolean | AddEventListenerOptions
    ): void {
        super.addEventListener(
            type,
            listener as EventListenerOrEventListenerObject | null,
            options
        );
    }

    /**
     * Typed `EventTarget.removeEventListener`.
     *
     * @param type - event name
     * @param listener - callback or `handleEvent` object
     * @param options - native listener options
     */
    public override removeEventListener<K extends Types.EventName<Events>>(
        type: K,
        listener: Types.TypedEventListener<Events, K> | null,
        options?: boolean | EventListenerOptions
    ): void {
        super.removeEventListener(
            type,
            listener as EventListenerOrEventListenerObject | null,
            options
        );
    }

    /**
     * Typed `EventTarget.dispatchEvent`.
     *
     * @param event - declared event
     * @returns `false` if a listener called `preventDefault()` on a cancelable event
     */
    public override dispatchEvent(event: Types.AnyEventOf<Events>): boolean {
        return super.dispatchEvent(event);
    }
}

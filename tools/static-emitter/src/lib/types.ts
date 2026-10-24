import type { TypedCustomEvent } from '../typed-custom-event.js';

/**
 * Map of event name to either an `Event` (dispatched as-is) or a detail value
 * (wrapped in a `TypedCustomEvent`). Any object type, so an interface works too.
 */
export type EventMap = object;

/**
 * Default event map, which declares no events.
 */
// eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- intentionally declares no keys
export type NoEvents = Record<never, never>;

/**
 * All declared event names.
 *
 * @template Events event map
 */
export type EventName<Events extends EventMap> = Extract<keyof Events, string>;

/**
 * Event names whose value is a detail rather than an `Event`.
 * Only these can be used with the `StaticEmitter` helper methods.
 *
 * @template Events event map
 */
export type DetailEventName<Events extends EventMap> = {
    [K in EventName<Events>]: Events[K] extends Event ? never : K;
}[EventName<Events>];

/**
 * The event object dispatched for an event name.
 *
 * @template Events event map
 * @template K event name
 */
export type EventOf<Events extends EventMap, K extends EventName<Events>> = Events[K] extends Event
    ? Events[K]
    : TypedCustomEvent<K, Events[K]>;

/**
 * Union of every event object that may be dispatched.
 *
 * @template Events event map
 */
export type AnyEventOf<Events extends EventMap> = {
    [K in EventName<Events>]: EventOf<Events, K>;
}[EventName<Events>];

/**
 * Native listener object, typed for a single event.
 *
 * @template Events event map
 * @template K event name
 */
export interface TypedEventListenerObject<Events extends EventMap, K extends EventName<Events>> {
    handleEvent: (event: EventOf<Events, K>) => void;
}

/**
 * Native listener (function or `handleEvent` object), typed for a single event.
 *
 * @template Events event map
 * @template K event name
 */
export type TypedEventListener<Events extends EventMap, K extends EventName<Events>> =
    | TypedEventListenerObject<Events, K>
    | ((event: EventOf<Events, K>) => void);

/**
 * `StaticEmitter` listener, which receives the unwrapped detail first.
 *
 * @template Events event map
 * @template K event name
 */
export type DetailListener<Events extends EventMap, K extends DetailEventName<Events>> = (
    detail: Events[K],
    event: TypedCustomEvent<K, Events[K]>
) => void;

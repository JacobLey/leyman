import type CustomEvent from '#custom-event';

export declare const events: unique symbol;

/**
 * First property is event "type", second is "detail".
 */
export type EventDict = Record<string | symbol, unknown>;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/ban-types, @typescript-eslint/no-empty-object-type
export type EmptyObject = {};

/**
 * Typing interface of emitter.
 *
 * `events` indicates events declared explicitly (e.g. via class extensions),
 * and via generic parameters.
 *
 * @template T
 */
export interface IEmitter<T extends EventDict = EventDict> {
    [events]: T;
}

/**
 * List of all registered events for an emitter.
 *
 * @template Emitter emitter type
 */
export type AllEventTypes<Emitter extends IEmitter> = keyof Emitter[typeof events];

/**
 * Helper type to access "detail" of event given "type".
 *
 * @template Emitter emitter type
 * @template Event event name
 */
export type GetEventDetail<
    Emitter extends IEmitter,
    Event extends AllEventTypes<Emitter>,
> = Emitter[typeof events][Event];

/**
 * List _all_ registered event names, both native `Event` and wrapped `CustomEvent`.
 *
 * Restricted to `string` as that is native implementation requirement.
 *
 * @template Emitter emitter type
 */
export type EventList<Emitter extends IEmitter> = Extract<AllEventTypes<Emitter>, string>;

/**
 * List of events that support being wrapped by custom event.
 *
 * Not restricted to string as non-strings are replaced with pseudo-random strings.
 *
 * Events that declare explicit Event types are not allowed and must use native methods.
 *
 * @template Emitter emitter type
 */
export type CustomEventList<Emitter extends IEmitter> = {
    [K in AllEventTypes<Emitter>]: GetEventDetail<Emitter, K> extends Event ? never : K;
}[AllEventTypes<Emitter>] &
    (string | symbol);

/**
 * Convenience wrapper for assigning the `type` + `detail` to a custom event if possible.
 *
 * If `type` is declared as a symbol | number, it will be typed as a generic `string`.
 *
 * @template Type
 * @template Detail context
 */
export type EventType<Type extends number | string | symbol, Detail> = Detail extends Event
    ? Detail
    : CustomEvent<Type extends string ? Type : string, Detail>;

export type EventListenerParam<
    Emitter extends IEmitter,
    EventName extends EventList<Emitter>,
> = EventType<EventName, GetEventDetail<Emitter, EventName>>;

/**
 * Native EventTarget listener, with additional types for event + detail.
 *
 * @template Emitter
 * @template EventName
 */
type EventTargetCallback<Emitter extends IEmitter, EventName extends EventList<Emitter>> = (
    event: EventListenerParam<Emitter, EventName>
) => void;

/**
 * Native EventTarget listeners can also be an object with `handleEvent` method.
 *
 * @template Emitter
 * @template EventName
 */
interface EventTargetHandler<Emitter extends IEmitter, EventName extends EventList<Emitter>> {
    handleEvent: EventTargetCallback<Emitter, EventName>;
}

/**
 * Convenience union of both allowed native listener signatures.
 *
 * @template Emitter
 * @template EventName
 */
export type EventTargetListener<Emitter extends IEmitter, EventName extends EventList<Emitter>> =
    | EventTargetCallback<Emitter, EventName>
    | EventTargetHandler<Emitter, EventName>;

/**
 * Null is required for consistency with default types.
 * Usage of null is NOOP, and will often log internal warnings.
 *
 * @template Emitter
 * @template EventName
 */
export type NullishEventTargetListener<
    Emitter extends IEmitter,
    EventName extends EventList<Emitter>,
> = EventTargetListener<Emitter, EventName> | null;

/**
 * CustomEvent listener that is internally wrapped for EventTarget.
 *
 * @template Emitter
 * @template EventName
 */
export type CustomEventListener<
    Emitter extends IEmitter,
    EventName extends CustomEventList<Emitter>,
> = (
    eventDetail: GetEventDetail<Emitter, EventName>,
    customEvent: EventType<EventName, GetEventDetail<Emitter, EventName>>
) => void;

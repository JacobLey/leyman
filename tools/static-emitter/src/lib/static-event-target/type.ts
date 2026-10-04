import * as Types from '../types.js';

/**
 * Type-only cast of EventTarget.
 *
 * @template InterfaceEvents map of event to type
 */
export declare class StaticEventTarget<InterfaceEvents extends Types.EventDict = Types.EmptyObject>
    extends EventTarget
    implements Types.IEmitter<InterfaceEvents>
{
    /**
     * Child classes _should_ declare types using this property.
     */
    declare public [Types.events]: InterfaceEvents;

    // Existing methods, just with type overrides.
    // Only `string` events are allowed and explicit Event usage is required.

    declare public addEventListener: <K extends Types.EventList<this>>(
        type: K,
        listener: Types.NullishEventTargetListener<this, K>,
        options?: boolean | AddEventListenerOptions
    ) => void;

    declare public dispatchEvent: <K extends Types.EventList<this>>(
        event: Types.EventListenerParam<this, K>
    ) => boolean;

    declare public removeEventListener: <K extends Types.EventList<this>>(
        type: K,
        listener: Types.NullishEventTargetListener<this, K>,
        options?: boolean | EventListenerOptions
    ) => void;
}

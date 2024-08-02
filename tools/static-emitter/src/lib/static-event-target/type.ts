import * as Types from '../types.js';

/**
 * Type-only cast of EventTarget.
 *
 * @template InterfaceEvents
 */
export declare class StaticEventTarget<InterfaceEvents extends Types.EventDict = Types.EmptyObject>
    extends EventTarget
    implements Types.IEmitter<InterfaceEvents>
{
    /**
     * Child classes _should_ declare types using this property.
     */
    public declare [Types.events]: InterfaceEvents;

    // Existing methods, just with type overrides.
    // Only `string` events are allowed and explicit Event usage is required.

    public declare addEventListener: <K extends Types.EventList<this>>(
        type: K,
        listener: Types.NullishEventTargetListener<this, K>,
        options?: boolean | AddEventListenerOptions
    ) => void;

    public declare dispatchEvent: <K extends Types.EventList<this>>(
        event: Types.EventListenerParam<this, K>
    ) => boolean;

    public declare removeEventListener: <K extends Types.EventList<this>>(
        type: K,
        listener: Types.NullishEventTargetListener<this, K>,
        options?: boolean | EventListenerOptions | undefined
    ) => void;
}

import type { TypedEvent } from '#typed-event';

/**
 * Override CustomEvent typing to
 */
declare class CustomEvent<E extends string, T = null>
    extends globalThis.CustomEvent<T>
    implements TypedEvent<E>
{
    public declare readonly type: E;

    public constructor(
        type: E,
        ...options: T extends null
            ? [] | [CustomEventInit<T>]
            : [CustomEventInit<T> & { detail: T }]
    );
}

export default CustomEvent;

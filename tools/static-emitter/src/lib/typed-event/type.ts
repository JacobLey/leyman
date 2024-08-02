/**
 * Type-only override of `Event` that binds the `type` parameter.
 *
 * @template T
 */
export declare class TypedEvent<T extends string> extends Event {
    public readonly type: T;

    /**
     * @override
     */
    public constructor(type: T, eventInitDict?: EventInit);
}

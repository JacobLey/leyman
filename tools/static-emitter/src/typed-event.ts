/**
 * `Event` with the `type` bound to a literal event name.
 *
 * @template Type event name
 */
export class TypedEvent<Type extends string> extends Event {
    declare public readonly type: Type;

    /**
     * Only narrows the `type` parameter, so it can be inferred.
     *
     * @param type - event name
     * @param eventInitDict - native event options
     */
    public constructor(type: Type, eventInitDict?: EventInit) {
        super(type, eventInitDict);
    }
}

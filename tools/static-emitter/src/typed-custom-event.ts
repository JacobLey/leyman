/**
 * `CustomEvent` with the `type` bound to a literal event name and a typed `detail`.
 *
 * `detail` may only be omitted when it accepts `null`.
 *
 * @template Type event name
 * @template Detail event data
 */
export class TypedCustomEvent<Type extends string, Detail = null> extends CustomEvent<Detail> {
    declare public readonly type: Type;

    readonly #detail: Detail;

    /**
     * @param type - event name
     * @param args - native event options, including `detail`
     */
    public constructor(
        type: Type,
        ...args: null extends Detail
            ? [eventInitDict?: CustomEventInit<Detail>]
            : [eventInitDict: CustomEventInit<Detail> & { detail: Detail }]
    ) {
        super(type, ...args);
        const [eventInitDict] = args;
        // Native `CustomEvent` coerces an `undefined` detail to `null`, which would break the declared type.
        this.#detail = (
            eventInitDict && 'detail' in eventInitDict ? eventInitDict.detail : null
        ) as Detail;
    }

    /**
     * @override
     */
    public override get detail(): Detail {
        return this.#detail;
    }
}

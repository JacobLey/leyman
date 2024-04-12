export type AllowableAdditionalContext = object | null | undefined | void;
export type MergeContext<
    Existing extends object,
    Additional extends AllowableAdditionalContext,
> = Additional extends object
    ? {
          [K in keyof (Additional & Existing)]: (Additional & Existing)[K];
      }
    : Existing;

/**
 * Combine incoming existing context with the value generated by the hook.
 *
 * If hook returns a falsy value, the value is ignored and the existing
 * value is returned untouched.
 *
 * @param existingProm - promise of context generated by previous hooks
 * @param additionalProm - promise of context generated by current hook
 * @returns promise of merged contexts
 */
export const mergeContexts = async <
    Existing extends object,
    Additional extends AllowableAdditionalContext,
>(
    /**
     * Existing context, optionally wrapped in a promise
     */
    existingProm: Existing | Promise<Existing>,
    /**
     * Context returned by hook, optionally wrapped in a promise
     */
    additionalProm: Additional | Promise<Additional>
): Promise<MergeContext<Existing, Awaited<Additional>>> => {
    const [existing, additional] = await Promise.all([
        existingProm,
        additionalProm,
    ]);

    if (!additional) {
        return existing as MergeContext<Existing, Awaited<Additional>>;
    }
    return { ...existing, ...additional } as MergeContext<
        Existing,
        Awaited<Additional>
    >;
};

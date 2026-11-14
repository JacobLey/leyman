/**
 * Compare strings by UTF-16 code unit, as RFC 8785 §3.2.3 sorts object keys
 * (https://www.rfc-editor.org/rfc/rfc8785#section-3.2.3), and as `<` compares strings.
 *
 * @param a - first string to compare
 * @param b - second string to compare
 * @returns negative if a sorts first, positive if b does, else 0
 */
export const compareCodeUnits = (a: string, b: string): number =>
    // eslint-disable-next-line sonarjs/strings-comparison -- Comparing by code unit is the point, not by locale
    a < b ? -1 : Number(a > b);

/**
 * Keys of an object in the order genever visits them: by UTF-16 code unit ({@link compareCodeUnits}), never in the
 * order they are written, or the order JavaScript keeps them in (integer-like keys first). It decides which of
 * several errors is reported, so every implementation reports the same one.
 *
 * @param object - object whose keys to visit
 * @returns its keys, sorted
 */
export const visitOrder = (object: object): string[] =>
    Object.keys(object).toSorted(compareCodeUnits);

/**
 * Visit each entry of an object in {@link visitOrder}, and list the results in the object's own order, which
 * generated code keeps.
 *
 * @param object - object whose entries to visit
 * @param visit - what to do with each entry
 * @returns key and result of each entry, in the object's order
 */
export const visitEntries = <T, R>(
    object: Readonly<Record<string, T>>,
    visit: (key: string, value: T) => R
): [string, R][] => {
    const results = new Map(visitOrder(object).map(key => [key, visit(key, object[key]!)]));
    return Object.keys(object).map(key => [key, results.get(key)!]);
};

import type { NamespaceConstraint } from '#internal/lib/schema/ir.js';

/**
 * Which namespaces a wildcard allows: any, only those listed, or all but those listed (`null` for no
 * namespace), as XSD 1.1's namespace constraints
 * ([XSD 1.1 Part 1 §3.10.1](https://www.w3.org/TR/xmlschema11-1/#Wildcard_details)).
 */
export type Wildcard =
    | { readonly mode: 'any' }
    | { readonly mode: 'not' | 'only'; readonly namespaces: ReadonlySet<string | null> };

/**
 * Reads a wildcard's constraint from the IR.
 *
 * @param constraint - an IR wildcard
 * @returns its constraint
 */
export const fromIr = (constraint: NamespaceConstraint): Wildcard => {
    if (constraint.namespace !== undefined) {
        return { mode: 'only', namespaces: new Set(constraint.namespace) };
    }
    return constraint.notNamespace === undefined || constraint.notNamespace.length === 0
        ? { mode: 'any' }
        : { mode: 'not', namespaces: new Set(constraint.notNamespace) };
};

/**
 * Writes a wildcard's constraint as the IR does.
 *
 * @param wildcard - the constraint
 * @returns its IR properties, or `null` when it allows nothing, which the IR can't write
 */
export const toIr = (wildcard: Wildcard): NamespaceConstraint | null => {
    if (wildcard.mode === 'any') {
        return {};
    }
    if (wildcard.mode === 'not') {
        return { notNamespace: [...wildcard.namespaces] };
    }
    return wildcard.namespaces.size === 0 ? null : { namespace: [...wildcard.namespaces] };
};

/**
 * Whether a wildcard allows a namespace.
 *
 * @param wildcard - the constraint
 * @param namespace - namespace name, `null` for none
 * @returns whether it allows it
 */
export const isAllowed = (wildcard: Wildcard, namespace: string | null): boolean =>
    wildcard.mode === 'any' || wildcard.namespaces.has(namespace) === (wildcard.mode === 'only');

/**
 * Namespaces in both sets.
 *
 * @param a - namespaces, whose order the result keeps
 * @param b - more namespaces
 * @returns those of `a` also in `b`
 */
const both = (
    a: ReadonlySet<string | null>,
    b: ReadonlySet<string | null>
): ReadonlySet<string | null> =>
    // Not `intersection`, whose order depends on which set is smaller.
    a.difference(a.difference(b));

/**
 * The namespaces both wildcards allow, as an attribute group's wildcard combines with a type's
 * ([XSD 1.1 Part 1 §3.10.6.4](https://www.w3.org/TR/xmlschema11-1/#cos-aw-intersect)).
 *
 * @param a - one wildcard
 * @param b - another
 * @returns their intersection
 */
export const intersect = (a: Wildcard, b: Wildcard): Wildcard => {
    if (a.mode === 'any') {
        return b;
    }
    if (b.mode === 'any') {
        return a;
    }
    if (a.mode === 'not' && b.mode === 'not') {
        return { mode: 'not', namespaces: a.namespaces.union(b.namespaces) };
    }
    const [listed, other] = a.mode === 'only' ? [a, b] : [b, a];
    return {
        mode: 'only',
        namespaces:
            other.mode === 'only'
                ? both(listed.namespaces, other.namespaces)
                : listed.namespaces.difference(other.namespaces),
    };
};

/**
 * The namespaces either wildcard allows, as an extension's wildcard combines with its base type's
 * ([XSD 1.1 Part 1 §3.10.6.3](https://www.w3.org/TR/xmlschema11-1/#cos-aw-union)).
 *
 * @param a - one wildcard
 * @param b - another
 * @returns their union
 */
export const unite = (a: Wildcard, b: Wildcard): Wildcard => {
    if (a.mode === 'any' || b.mode === 'any') {
        return { mode: 'any' };
    }
    if (a.mode === 'only' && b.mode === 'only') {
        return { mode: 'only', namespaces: a.namespaces.union(b.namespaces) };
    }
    const [excluded, other] = a.mode === 'not' ? [a, b] : [b, a];
    const namespaces =
        other.mode === 'not'
            ? both(excluded.namespaces, other.namespaces)
            : excluded.namespaces.difference(other.namespaces);
    return namespaces.size === 0 ? { mode: 'any' } : { mode: 'not', namespaces };
};

/**
 * The namespaces every wildcard allows.
 *
 * @param wildcards - constraints to intersect
 * @returns their intersection, or `null` when there are none
 */
export const intersectAll = (wildcards: readonly Wildcard[]): Wildcard | null => {
    let [result = null, ...rest] = wildcards;
    for (const wildcard of rest) {
        result = intersect(result!, wildcard);
    }
    return result;
};

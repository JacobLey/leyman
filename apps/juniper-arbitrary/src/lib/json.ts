/**
 * Serialize a JSON value so that deep-equal values, whatever their key order, serialize the same.
 *
 * @param value - value to serialize
 * @returns canonical string
 */
export const canonicalJson = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map(item => canonicalJson(item)).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value)
            .toSorted(([a], [b]) => (a < b ? -1 : 1))
            .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
};

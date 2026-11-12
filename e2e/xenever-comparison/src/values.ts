/**
 * Tool-neutral reads of a parsed value. Every tool shapes its values its own way (xenever under `attributes` and
 * `children`, others with prefixed attribute keys or prefixed element names), so probes look values up by local name
 * anywhere in the tree, rather than by one tool's path.
 */

/**
 * The local name a key stands for: without an attribute marker (`@_`, `@`, `$`) or a namespace prefix (`p:`).
 *
 * @param key - property key
 * @returns the key without them
 */
const localName = (key: string): string => key.replace(/^(?:@_|@|\$)/v, '').replace(/^[^:]*:/v, '');

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Every value held under a key of this local name, at any depth, in document order.
 *
 * @param value - parsed value
 * @param name - local name of an element or attribute
 * @returns the values found
 */
export const findAll = (value: unknown, name: string): unknown[] => {
    if (!isObject(value)) {
        return [];
    }
    return Object.entries(value).flatMap(([key, child]) => [
        ...(localName(key) === name && !Array.isArray(value) ? [child] : []),
        ...findAll(child, name),
    ]);
};

/**
 * Every scalar in a value (strings, numbers, bigints and booleans) as text, in the order the value holds them.
 *
 * @param value - parsed value
 * @returns the scalars
 */
export const leaves = (value: unknown): string[] => {
    if (isObject(value)) {
        return Object.values(value).flatMap(child => leaves(child));
    }
    // Otherwise a string, number, bigint, boolean or null
    return [typeof value === 'string' ? value : String(value)];
};

/**
 * Text pieces of a value that are in a list, in the order the value holds them, for checking order is kept.
 *
 * @param value - parsed value
 * @param pieces - the text to look for
 * @returns the pieces found, in order
 */
export const orderOf = (value: unknown, pieces: readonly string[]): string[] =>
    leaves(value)
        .map(leaf => leaf.trim())
        .filter(leaf => pieces.includes(leaf));

/**
 * JSON of a value, with bigints as `<digits>n`, for comparing values and showing them in the report.
 *
 * @param value - parsed value
 * @returns its JSON
 */
export const show = (value: unknown): string =>
    value === undefined
        ? 'undefined'
        : JSON.stringify(value, (_, child: unknown) =>
              typeof child === 'bigint' ? `${child}n` : child
          );

/**
 * TypeScript source for a value, to check it against a tool's type.
 *
 * @param value - parsed value
 * @returns an expression
 */
export const literal = (value: unknown): string => {
    if (typeof value === 'bigint') {
        return `${value}n`;
    }
    if (Array.isArray(value)) {
        return `[${value.map(item => literal(item)).join(', ')}]`;
    }
    if (isObject(value)) {
        const entries = Object.entries(value).map(
            ([key, child]) => `${JSON.stringify(key)}: ${literal(child)}`
        );
        return `{ ${entries.join(', ')} }`;
    }
    return JSON.stringify(value);
};

/**
 * Remove, from a copy of a value, the first property of this local name.
 */
export const remove = Symbol('remove');

/**
 * A copy of a value with the first property of a local name replaced, for a value a precise type rejects.
 *
 * @param value - parsed value
 * @param name - local name of the property
 * @param replace - its new value, from the old one, or `remove`
 * @returns the copy, or `undefined` when the value has no such property
 */
export const replaceFirst = (
    value: unknown,
    name: string,
    replace: (old: unknown) => unknown
): unknown => {
    const copy = structuredClone(value);
    const hasReplaced = (node: unknown): boolean => {
        if (!isObject(node)) {
            return false;
        }
        for (const [key, child] of Object.entries(node)) {
            if (localName(key) === name && !Array.isArray(node)) {
                const replacement = replace(child);
                if (replacement === remove) {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- A key found by its local name
                    delete node[key];
                } else {
                    node[key] = replacement;
                }
                return true;
            }
            if (hasReplaced(child)) {
                return true;
            }
        }
        return false;
    };
    return hasReplaced(copy) ? copy : undefined;
};

/**
 * Where an error says the problem is, as far as it says.
 */
export interface ErrorLocation {
    readonly line?: number | undefined;
    readonly column?: number | undefined;
    /**
     * The `path` the error gives, or else its message, which may name one.
     */
    readonly path: string;
}

/**
 * The message of what a tool threw.
 *
 * @param error - what it threw
 * @returns its message
 */
export const messageOf = (error: unknown): string =>
    Error.isError(error) ? error.message : String(error);

const lineKeys = ['line', 'lineNumber'];
const columnKeys = ['column', 'col', 'columnNumber'];

/**
 * The location an error reports, from its properties: on the error, or in a `location` or `locator` object, as two of
 * the tools nest them. Its path is the `path` property, or else the message, which may name one.
 *
 * @param error - what a tool threw
 * @returns its line, column and path, where given
 */
export const locationOf = (error: unknown): ErrorLocation => {
    const fields = isObject(error) ? error : {};
    const holders = [fields, fields.location, fields.locator].filter(isObject);
    const numberOf = (keys: readonly string[]): number | undefined =>
        holders
            .flatMap(holder => keys.map(key => holder[key]))
            .find(value => typeof value === 'number');
    const line = numberOf(lineKeys);
    const column = numberOf(columnKeys);
    return {
        ...(line !== undefined && { line }),
        ...(column !== undefined && { column }),
        path: typeof fields.path === 'string' ? fields.path : messageOf(error),
    };
};

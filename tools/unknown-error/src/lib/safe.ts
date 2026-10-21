/**
 * Helpers that inspect a thrown value without ever throwing themselves.
 *
 * Anything can be thrown, including objects with throwing getters, a throwing `toString` and Proxies
 * that throw from every trap. Every read of a caught value goes through these helpers, so that
 * handling an error can't raise a new one from inside a `catch`.
 */

/**
 * Whether `value` can have properties: objects, arrays and functions.
 *
 * @param value - any value
 * @returns `true` for non-null objects and functions
 */
export const isObject = (value: unknown): value is object =>
    (typeof value === 'object' && value !== null) || typeof value === 'function';

/**
 * Recognizes Errors where `Error.isError` is missing (Chrome before 134, Firefox before 138, Safari before 18.4).
 *
 * `instanceof` covers this realm, and the object tag covers Errors from other realms, but both run
 * Proxy traps (`getPrototypeOf`, then a `Symbol.toStringTag` read), hence the `try`. Unlike
 * `Error.isError`, a Proxy around an Error passes, and so does an object whose `Symbol.toStringTag`
 * is forged as `'Error'`.
 *
 * @param value - any value
 * @returns whether `value` looks like an Error to the checks this runtime has
 */
const isErrorFallback = (value: unknown): boolean => {
    if (!isObject(value)) {
        return false;
    }
    try {
        return (
            // eslint-disable-next-line unicorn/prefer-error-is-error -- the fallback for when it's missing
            value instanceof Error || Object.prototype.toString.call(value) === '[object Error]'
        );
    } catch {
        return false;
    }
};

/**
 * Whether `value` is an Error, including one from another realm (`vm`, iframes). Never throws.
 *
 * Uses `Error.isError` where the runtime has it, which recognizes every realm's Errors without
 * running any Proxy trap. It is read on each call rather than once, so a polyfill loaded later is
 * still used.
 *
 * @param value - any value
 * @returns whether `value` is an Error
 */
export const isError = (value: unknown): value is Error => {
    const native = (Error as { isError?: (value: unknown) => boolean }).isError;
    return typeof native === 'function' ? native(value) : isErrorFallback(value);
};

/**
 * Reads a property, returning `undefined` when a getter or Proxy trap throws.
 *
 * @param value - object to read from
 * @param key - property to read
 * @returns the property's value, or `undefined` if reading it threw
 */
export const safeGet = (value: object, key: PropertyKey): unknown => {
    try {
        return Reflect.get(value, key);
    } catch {
        return undefined;
    }
};

/**
 * Checks for a property (own or inherited), returning `false` when a Proxy `has` trap throws.
 *
 * @param value - object to check
 * @param key - property to look for
 * @returns whether the property exists
 */
export const hasProperty = (value: object, key: PropertyKey): boolean => {
    try {
        return Reflect.has(value, key);
    } catch {
        return false;
    }
};

/**
 * Lists own enumerable string keys, returning none when a Proxy `ownKeys` trap throws.
 *
 * @param value - object to list
 * @returns its keys
 */
export const safeKeys = (value: object): string[] => {
    try {
        return Object.keys(value);
    } catch {
        return [];
    }
};

/**
 * JSON with cycles and BigInts, which plain `JSON.stringify` throws on.
 *
 * Cycles are found by tracking the chain of objects above the current one, rather than every object
 * seen so far, so an object referenced twice without a cycle (`{ a: x, b: x }`) is printed both times.
 *
 * @param value - object to serialize
 * @returns JSON, or `undefined` when there is nothing to serialize (e.g. `toJSON` returns `undefined`)
 */
const toJson = (value: object): string | undefined => {
    const ancestors: unknown[] = [];
    return JSON.stringify(value, function (this: unknown, _key, nested: unknown) {
        if (typeof nested === 'bigint') {
            return `${nested}n`;
        }
        if (!isObject(nested)) {
            return nested;
        }
        // `this` is the object holding `nested`. Anything deeper than it on the stack belongs to a
        // sibling branch that has already been fully serialized.
        while (ancestors.length > 0 && ancestors.at(-1) !== this) {
            ancestors.pop();
        }
        if (ancestors.includes(nested)) {
            return '[Circular]';
        }
        ancestors.push(nested);
        return nested;
    });
};

/**
 * Describes an object, falling back through JSON, `String()` and the object's tag.
 *
 * Each fallback can throw on a hostile value (`toJSON`, `toString`, then the `Symbol.toStringTag`
 * getter), hence the chain.
 *
 * @param value - object to describe
 * @returns a description
 */
const stringifyObject = (value: object): string => {
    try {
        const json = toJson(value);
        if (json !== undefined) {
            return json;
        }
    } catch {}
    try {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Reached when JSON had nothing to show, where a custom `toString` may still help
        return String(value);
    } catch {}
    try {
        return Object.prototype.toString.call(value);
    } catch {}
    return '[unprintable value]';
};

/**
 * Describes any value as a string, without throwing.
 *
 * @param value - any value
 * @returns a readable description
 */
export const safeStringify = (value: unknown): string => {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'bigint') {
        return `${value}n`;
    }
    if (typeof value === 'function') {
        // `String(fn)` prints the whole function's source
        const name = safeGet(value, 'name');
        return typeof name === 'string' && name ? `[Function ${name}]` : '[Function (anonymous)]';
    }
    if (isObject(value)) {
        return stringifyObject(value);
    }
    // `null`, `undefined`, booleans, numbers and symbols, none of which can throw here
    return String(value);
};

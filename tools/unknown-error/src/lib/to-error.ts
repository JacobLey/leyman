import { hasProperty, isError, isObject, safeGet, safeKeys, safeStringify } from '#safe';

/**
 * Longest message a `NonError` keeps, so a huge thrown object doesn't flood logs.
 */
const MAX_MESSAGE_LENGTH = 1000;

/**
 * Wraps a thrown value that was neither an Error nor shaped like one.
 *
 * The message describes the value, and the value itself is kept as `thrown`.
 */
export class NonError extends Error {
    public readonly thrown: unknown;

    /**
     * @param thrown - the value that was thrown
     * @param options - standard Error options, such as `cause`
     */
    public constructor(thrown: unknown, options?: ErrorOptions) {
        const message = safeStringify(thrown);
        super(
            message.length > MAX_MESSAGE_LENGTH
                ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…`
                : message,
            options
        );
        this.name = 'NonError';
        this.thrown = thrown;
    }
}

/**
 * Rebuilds a real Error from an object with a string `message`, such as an error that went through
 * JSON, `postMessage` or an RPC boundary.
 *
 * @param value - object shaped like an error
 * @param message - its message, already read
 * @returns a new Error with the object's name, stack, cause and other own properties
 */
const fromErrorLike = (value: object, message: string): Error => {
    const error = hasProperty(value, 'cause')
        ? new Error(message, { cause: safeGet(value, 'cause') })
        : new Error(message);

    const name = safeGet(value, 'name');
    if (typeof name === 'string') {
        error.name = name;
    }
    const stack = safeGet(value, 'stack');
    if (typeof stack === 'string') {
        error.stack = stack;
    }

    for (const key of safeKeys(value)) {
        // Skips keys the Error already has, own or inherited. Besides `message` and friends, that
        // includes `__proto__`, so a JSON-parsed `"__proto__"` key can't replace the prototype.
        if (!Reflect.has(error, key)) {
            Object.defineProperty(error, key, {
                configurable: true,
                enumerable: true,
                value: safeGet(value, key),
                writable: true,
            });
        }
    }
    return error;
};

/**
 * Converts any caught value to an Error. Never throws.
 *
 * - Errors, including those from another realm (`vm`, iframes), are returned as-is.
 * - Objects with a string `message` are rebuilt as an Error, keeping their name, stack, cause and
 *   other properties such as `code`.
 * - Anything else is wrapped in a {@link NonError}.
 *
 * @param value - a caught value
 * @returns `value` when it is already an Error, otherwise a new Error describing it
 */
export const toError = (value: unknown): Error => {
    if (isError(value)) {
        return value;
    }
    if (isObject(value)) {
        const message = safeGet(value, 'message');
        if (typeof message === 'string') {
            return fromErrorLike(value, message);
        }
    }
    return new NonError(value);
};

/**
 * Reads the message of any caught value. Never throws.
 *
 * @param value - a caught value
 * @returns the message of `toError(value)`
 */
export const getErrorMessage = (value: unknown): string => {
    const error = toError(value);
    try {
        const { message } = error;
        return typeof message === 'string' ? message : safeStringify(message);
    } catch {
        return '[unreadable message]';
    }
};

/**
 * Whether `value` is an Error with the given `code`, such as Node's `ENOENT`.
 *
 * @param value - a caught value
 * @param code - code to match
 * @returns `true` when `value` is an Error whose `code` is `code`, narrowing its type
 */
export const hasCode = <const Code extends number | string>(
    value: unknown,
    code: Code
): value is Error & { readonly code: Code } => isError(value) && safeGet(value, 'code') === code;

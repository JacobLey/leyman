import { IdempotencyKeyHeaderError } from './errors.js';

const maxLength = 255;

/**
 * Whether every character is from `0x20` (space) to `0x7E`, what a key may hold.
 */
const printable = /^[\u{20}-\u{7E}]*$/v;

/**
 * Reads a Structured Field String ([RFC 9651, section 3.3.3](https://www.rfc-editor.org/rfc/rfc9651#section-3.3.3)),
 * which takes up the whole value.
 *
 * @param value - Header value, starting with a quote
 * @returns The string's content, or `null` if the value isn't one string
 */
const parseSfString = (value: string): string | null => {
    let content = '';
    for (let i = 1; i < value.length; i++) {
        const char = value[i]!;
        if (char === '"') {
            return i === value.length - 1 ? content : null;
        }
        if (char === '\\') {
            i++;
            const escaped = value[i];
            if (escaped !== '"' && escaped !== '\\') {
                return null;
            }
            content += escaped;
        } else {
            content += char;
        }
    }
    return null;
};

/**
 * Reads the key from one header value.
 *
 * @param value - The header's value
 * @returns The key, or `false` when invalid
 */
export const readKeyValue = (value: string): false | string => {
    const key = value.startsWith('"') ? parseSfString(value) : value;
    return key === null || key.length === 0 || key.length > maxLength
        ? false
        : printable.test(key) && key;
};

/**
 * As {@link parseIdempotencyKey}, without throwing.
 *
 * @param values - The header's values
 * @returns The key, `null` without a header, or `false` when invalid
 */
export const readKey = (values: readonly string[]): false | string | null => {
    if (values.length !== 1) {
        return values.length === 0 ? null : false;
    }
    return readKeyValue(values[0]!);
};

/**
 * Reads the key from the values of the `Idempotency-Key` header. A value in quotes is a Structured Field String,
 * and the key is its content; any other value is the key as it is.
 *
 * `fetch`'s `Headers` joins repeated headers into one value with `, `, so it can't tell two headers from one
 * holding a comma: pass every value separately when the server gives them (as Node.js's `IncomingMessage` does).
 *
 * @param values - The header's values, one for each time the request has it
 * @returns The key, or `null` when the request has no header
 * @throws {IdempotencyKeyHeaderError} When there is more than one header, or it holds no valid key
 */
export const parseIdempotencyKey = (values: readonly string[]): string | null => {
    const key = readKey(values);
    if (key === false) {
        throw new IdempotencyKeyHeaderError(values);
    }
    return key;
};

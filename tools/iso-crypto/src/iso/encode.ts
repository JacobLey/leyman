import { inputToEncoding } from './lib/input-to-encoding.js';
import { defaultEncoding, type Encoding, Encodings, type InputText } from './lib/types.js';

const BITS_PER_HEX = 4;
const HEX_SIZE = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const { atob, btoa } = globalThis;

/**
 * Convert a base64-encoded string to base64url.
 * Idempotent.
 *
 * @param text - base64 text
 * @returns base64url text
 */
const base64url = (text: string): string =>
    text.replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');

const EXTRA_EQUALS = '====';
/**
 * Convert a base64url-encoded string to base64.
 * Idempotent.
 *
 * @param text - base64url text
 * @returns base64 text
 */
const base64standard = (text: string): string => {
    const charReplaced = text.replaceAll('-', '+').replaceAll('_', '/');
    let appendEquals =
        charReplaced + '='.repeat((BITS_PER_HEX - (text.length % BITS_PER_HEX)) % BITS_PER_HEX);
    while (appendEquals.endsWith(EXTRA_EQUALS)) {
        appendEquals = appendEquals.slice(0, -EXTRA_EQUALS.length);
    }
    return appendEquals;
};

const toBase64 = (buf: ArrayBuffer | number[] | Uint8Array): string =>
    base64url(btoa(String.fromCodePoint(...new Uint8Array(buf))));
const fromBase64 = (str: string): Uint8Array =>
    Uint8Array.from(atob(base64standard(str)), x => x.codePointAt(0)!);

const toHex = (buf: Uint8Array): string =>
    [...buf].map(x => x.toString(HEX_SIZE).padStart(2, '0')).join('');
const fromHex = (str: string): Uint8Array => {
    const length = str.length % 2 ? str.length + 1 : str.length;
    return new Uint8Array(
        (str.padStart(length, '0').match(/.{2}/gu) ?? []).map(byte =>
            Number.parseInt(byte, HEX_SIZE)
        )
    );
};

/**
 * Decodes the incoming text to a Uint8Array.
 *
 * Encoding of text is inferred as UTF8 if not otherwise specified.
 *
 * @param input - text to decode
 * @returns decoded
 */
export const decode = (input: InputText): Uint8Array => {
    const { encoding, text } = inputToEncoding(input);

    if (encoding === Encodings.RAW) {
        return text;
    }
    if (encoding === Encodings.UTF8) {
        return encoder.encode(text);
    }
    if (encoding === Encodings.HEX) {
        return fromHex(text);
    }

    return fromBase64(text);
};

/**
 * Encodes the incoming content as text.
 *
 * @param input - content to encoded
 * @param [encoding] - encoding to use, defaults to UTF8
 * @returns encoded
 */
export const encode = (
    input: InputText,
    encoding: Encoding | undefined = defaultEncoding
): string => {
    const buffer = decode(input);

    if (encoding === Encodings.UTF8) {
        return decoder.decode(buffer);
    }
    if (encoding === Encodings.HEX) {
        return toHex(buffer);
    }

    const url = toBase64(buffer);
    if (encoding === Encodings.BASE64) {
        return base64standard(url);
    }

    return url;
};

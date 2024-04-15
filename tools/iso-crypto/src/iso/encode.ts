import { inputToEncoding } from './lib/input-to-encoding.js';
import { defaultEncoding, type Encoding, type InputText } from './lib/types.js';

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

/**
 * Convert a base64url-encoded string to base64.
 * Idempotent.
 *
 * @param text - base64url text
 * @returns base64 text
 */
const base64standard = (text: string): string => {
    const charReplaced = text.replaceAll('-', '+').replaceAll('_', '/');
    const appendEquals = charReplaced + '='.repeat((4 - (text.length % 4)) % 4);
    return appendEquals.replace(/(?:={4})+$/u, '');
};

const toBase64 = (buf: ArrayBuffer | number[] | Uint8Array): string =>
    base64url(btoa(String.fromCodePoint(...new Uint8Array(buf))));
const fromBase64 = (str: string): Uint8Array =>
    Uint8Array.from(atob(base64standard(str)), x => x.codePointAt(0)!);

const toHex = (buf: Uint8Array): string =>
    [...buf].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (str: string): Uint8Array => {
    const length = str.length % 2 ? str.length + 1 : str.length;
    return new Uint8Array(
        (str.padStart(length, '0').match(/.{2}/gu) ?? []).map(byte => Number.parseInt(byte, 16))
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

    if (encoding === 'raw') {
        return text;
    }
    if (encoding === 'utf8') {
        return encoder.encode(text);
    }
    if (encoding === 'hex') {
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

    if (encoding === 'utf8') {
        return decoder.decode(buffer);
    }
    if (encoding === 'hex') {
        return toHex(buffer);
    }

    const url = toBase64(buffer);
    if (encoding === 'base64') {
        return base64standard(url);
    }

    return url;
};

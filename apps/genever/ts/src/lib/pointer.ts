/**
 * Percent-encodings of the characters a URI fragment may hold as they are, besides those `encodeURIComponent` already
 * leaves: `$ & + , / : ; = ? @`. See {@link encodeSegment}.
 */
const fragmentEscapes = /%(?:2[46BCF]|3[ABDF]|40)/gv;

/**
 * Percent-encode a JSON Pointer segment for a URI fragment (RFC 6901 §6,
 * https://www.rfc-editor.org/rfc/rfc6901#section-6): each UTF-8 byte of a character outside RFC 3986's `fragment`
 * (https://www.rfc-editor.org/rfc/rfc3986#section-3.5) is `%XX`, in uppercase. So `A-Z a-z 0-9 - . _ ~ ! $ & ' ( ) * +
 * , ; = : @ / ?` are kept, and `%` is `%25`, a space `%20`, and `é` `%C3%A9`.
 *
 * A lone surrogate, which has no UTF-8, is encoded as U+FFFD.
 *
 * @param segment - segment, with `~` and `/` already escaped
 * @returns percent-encoded segment
 */
const encodeSegment = (segment: string): string =>
    encodeURIComponent(segment.toWellFormed()).replaceAll(fragmentEscapes, kept =>
        decodeURIComponent(kept)
    );

/**
 * Append a key to a JSON Pointer in its URI fragment form: `~` is escaped as `~0` and `/` as `~1` (RFC 6901 §3), then
 * the segment is percent-encoded (RFC 6901 §6). So the property `a/b c` of `#/properties` is `#/properties/a~1b%20c`.
 * Every pointer genever reports, or names a generated type or field with, is built by this, so it is also a valid
 * `$ref` to the same value.
 *
 * @param pointer - JSON Pointer, as a URI fragment (e.g. `#/properties`)
 * @param key - key to append
 * @returns JSON Pointer to the key
 */
export const childPointer = (pointer: string, key: number | string): string =>
    `${pointer}/${encodeSegment(String(key).replaceAll('~', '~0').replaceAll('/', '~1'))}`;

/**
 * The key a segment of a pointer from {@link childPointer} names.
 *
 * @param segment - percent-encoded, escaped segment
 * @returns key
 */
export const decodeSegment = (segment: string): string =>
    decodeURIComponent(segment).replaceAll('~1', '/').replaceAll('~0', '~');

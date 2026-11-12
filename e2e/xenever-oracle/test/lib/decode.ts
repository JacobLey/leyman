/**
 * The encoding an XML declaration names, if any.
 *
 * @param text - the start of the document, decoded
 * @returns the label, lowercase
 */
const declaredEncoding = (text: string): string | undefined =>
    /^\u{FEFF}?<\?xml[^>]*?\sencoding\s*=\s*["'](?<label>[^"']+)["']/v
        .exec(text)
        ?.groups?.label?.toLowerCase();

/**
 * Decodes an XML file as an XML processor would ([XML 1.0 §4.3.3](https://www.w3.org/TR/xml/#charencoding)):
 * by its byte order mark, else by the encoding its XML declaration names, else as UTF-8. A byte order mark
 * with a declaration naming another encoding is a fatal error. `parse` and `loadXsd`'s `readFile` take
 * text, so decoding is the caller's job.
 *
 * @param bytes - the file
 * @returns its text, without a byte order mark
 * @throws {TypeError} for bytes invalid in the encoding, an encoding `TextDecoder` doesn't know, or a byte
 * order mark the declaration contradicts
 */
export const decodeXml = (bytes: Uint8Array): string => {
    let marked: string | null = null;
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        marked = 'utf-16be';
    } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        marked = 'utf-16le';
    } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        marked = 'utf8';
    }
    if (marked === null) {
        const latin1 = new TextDecoder('latin1');
        const declared = declaredEncoding(latin1.decode(bytes.subarray(0, 200)));
        const decoder = new TextDecoder(declared ?? 'utf8', { fatal: true });
        return decoder.decode(bytes);
    }
    const decoder = new TextDecoder(marked, { fatal: true });
    const text = decoder.decode(bytes);
    const declared = declaredEncoding(text);
    if (declared !== undefined) {
        // Compared by the encodings the labels name: `UTF-16` names either byte order.
        const named = new TextDecoder(declared);
        const isSame =
            named.encoding === decoder.encoding ||
            (named.encoding.startsWith('utf-16') && decoder.encoding.startsWith('utf-16'));
        if (!isSame) {
            throw new TypeError(
                `A ${decoder.encoding} byte order mark contradicts the declared encoding ${declared}`
            );
        }
    }
    return text;
};

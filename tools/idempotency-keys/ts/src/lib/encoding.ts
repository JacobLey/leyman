const encoder = new TextEncoder();

/**
 * The length of an absent field, so an absent value never hashes like an empty one.
 */
const absent = 0xffffffff;
const uint32Bytes = 4;
const hexRadix = 16;
const tokenBytes = 16;

/**
 * Writes out bytes as hex.
 *
 * @param bytes - Bytes to write out
 * @returns Lower-case hex, two characters a byte
 */
export const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, byte => byte.toString(hexRadix).padStart(2, '0')).join('');

/**
 * Reads hex back into bytes.
 *
 * @param hex - Lower-case hex, of an even length
 * @returns One byte for every two characters
 */
export const fromHex = (hex: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
        Number.parseInt(hex.slice(i * 2, i * 2 + 2), hexRadix)
    );

/**
 * A new claim token: 16 random bytes, as 32 lower-case hex characters.
 *
 * @returns 32 hex characters
 */
export const newToken = (): string => toHex(crypto.getRandomValues(new Uint8Array(tokenBytes)));

/**
 * Builds the input of one of the spec's hashes: each field is its length in bytes as a 32-bit big-endian unsigned
 * integer, then its bytes.
 */
export class FieldEncoder {
    readonly #parts: Uint8Array[] = [];

    /**
     * Appends a 32-bit big-endian unsigned integer.
     *
     * @param value - Integer to append
     * @returns This encoder
     */
    public uint32(value: number): this {
        const part = new Uint8Array(uint32Bytes);
        const view = new DataView(part.buffer);
        view.setUint32(0, value);
        this.#parts.push(part);
        return this;
    }

    /**
     * Appends a field: a string as UTF-8, bytes as they are, or `null` for an absent value.
     *
     * @param value - Field to append
     * @returns This encoder
     */
    public field(value: string | Uint8Array | null): this {
        if (value === null) {
            return this.uint32(absent);
        }
        const bytes = typeof value === 'string' ? encoder.encode(value) : value;
        this.uint32(bytes.byteLength);
        this.#parts.push(bytes);
        return this;
    }

    /**
     * SHA-256 of everything appended, through WebCrypto, so it runs wherever `fetch` does.
     *
     * @returns Lower-case hex digest
     */
    public async sha256(): Promise<string> {
        const input = new Uint8Array(this.#parts.reduce((sum, part) => sum + part.byteLength, 0));
        let offset = 0;
        for (const part of this.#parts) {
            input.set(part, offset);
            offset += part.byteLength;
        }
        const digest = await crypto.subtle.digest('SHA-256', input);
        return toHex(new Uint8Array(digest));
    }
}

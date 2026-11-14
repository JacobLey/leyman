import type { VerifyResult } from './signature.js';
import { createHash } from 'node:crypto';
import { GeneratedSignatureManifestError } from './errors.js';
import { verify } from './signature.js';

const VERSION = 1;
const HASH_PREFIX = 'v1:';
const HASH_LENGTH = 32;
const CR = 0x0d;
const LF = 0x0a;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const INDENT = '  ';

/**
 * Hashes of what produced a file, e.g. `{ "generator": "genever@1.0.0", "./user.json": "v1:…" }`.
 * Opaque to this package: the generator decides what to record, and how to check it.
 */
export type ManifestInputs = Readonly<Record<string, string>>;

export type ManifestEntry =
    | {
          /**
           * {@link contentHash} of the file.
           */
          readonly hash: string;
          readonly inputs?: ManifestInputs;
      }
    | {
          /**
           * The file carries its own signature token, which is checked instead of a hash.
           */
          readonly signature: 'inline';
          readonly inputs?: ManifestInputs;
      };

export interface Manifest {
    readonly version: typeof VERSION;
    /**
     * Entries by path relative to the manifest's directory, with `/` separators.
     */
    readonly files: Readonly<Record<string, ManifestEntry>>;
}

const normalizeLineBreaks = (bytes: Uint8Array): Uint8Array => {
    const result = new Uint8Array(bytes.length);
    let length = 0;
    for (const [i, byte] of bytes.entries()) {
        if (byte === CR && bytes[i + 1] === LF) {
            continue;
        }

        result[length] = byte;
        length++;
    }
    return result.subarray(0, length);
};

/**
 * Hash a file's content, for a manifest entry.
 *
 * `\r\n` counts as `\n` (also in binary content), so a checkout with `core.autocrlf` still matches.
 * Unlike an inline signature, manual sections are not excluded.
 *
 * @param content - file content
 * @returns `v1:` followed by 32 hex characters
 */
export const contentHash = (content: string | Uint8Array): string => {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    return (
        HASH_PREFIX +
        createHash('sha256').update(normalizeLineBreaks(bytes)).digest('hex').slice(0, HASH_LENGTH)
    );
};

/**
 * Check a file against its manifest entry.
 *
 * @param content - file content
 * @param entry - the file's manifest entry
 * @returns `valid` or `invalid` for a hash entry, the inline signature's result otherwise
 */
export const verifyManifestEntry = (
    content: string | Uint8Array,
    entry: ManifestEntry
): VerifyResult => {
    if ('signature' in entry) {
        return verify(typeof content === 'string' ? content : decoder.decode(content));
    }
    return { status: contentHash(content) === entry.hash ? 'valid' : 'invalid' };
};

const isStringRecord = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(item => typeof item === 'string');

const isEntry = (value: unknown): value is ManifestEntry => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const { hash, signature, inputs, ...rest } = value as Record<string, unknown>;
    return (
        Object.keys(rest).length === 0 &&
        (inputs === undefined || isStringRecord(inputs)) &&
        (typeof hash === 'string') !== (signature === 'inline') &&
        (hash === undefined || typeof hash === 'string') &&
        (signature === undefined || signature === 'inline')
    );
};

/**
 * Parse and validate a manifest.
 *
 * @param text - manifest file content
 * @returns the validated manifest object
 * @throws {GeneratedSignatureManifestError} if the text is not a valid manifest
 */
export const parseManifest = (text: string): Manifest => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new GeneratedSignatureManifestError('not valid JSON', { cause: err });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new GeneratedSignatureManifestError('not an object');
    }
    const { version, files } = parsed as Record<string, unknown>;
    if (version !== VERSION) {
        throw new GeneratedSignatureManifestError(`unsupported version ${String(version)}`);
    }
    if (typeof files !== 'object' || files === null || Array.isArray(files)) {
        throw new GeneratedSignatureManifestError('files is not an object');
    }
    const entries: Record<string, ManifestEntry> = {};
    for (const [path, entry] of Object.entries(files)) {
        if (!isEntry(entry)) {
            throw new GeneratedSignatureManifestError(`invalid entry for ${path}`);
        }
        entries[path] = entry;
    }
    return { version, files: entries };
};

/**
 * A record's entries by key in UTF-16 code unit order, the order of
 * [RFC 8785 §3.2.3](https://www.rfc-editor.org/rfc/rfc8785#section-3.2.3) and of JavaScript's `<`.
 * Keys are distinct, so none compare equal.
 *
 * @param record - to sort
 * @returns its entries, sorted
 */
const sortedEntries = <T>(record: Readonly<Record<string, T>>): [string, T][] =>
    Object.entries(record).toSorted(([a], [b]) => (a < b ? -1 : 1));

/**
 * Write an object from members in the given order, as `JSON.stringify(value, null, 2)` lays it
 * out. An object can't hold its keys in that order itself: integer-like keys always come first,
 * in numeric order.
 *
 * @param members - each key with its value's JSON text
 * @param indent - the indent of the line the object starts on
 * @returns JSON text
 */
const objectText = (members: readonly (readonly [string, string])[], indent: string): string => {
    if (members.length === 0) {
        return '{}';
    }
    const lines = members.map(
        ([key, value]) => `${indent}${INDENT}${JSON.stringify(key)}: ${value}`
    );
    return `{\n${lines.join(',\n')}\n${indent}}`;
};

const entryText = (entry: ManifestEntry, indent: string): string => {
    const members: [string, string][] = [
        'signature' in entry
            ? ['signature', JSON.stringify(entry.signature)]
            : ['hash', JSON.stringify(entry.hash)],
    ];
    if (entry.inputs) {
        const inputs = sortedEntries(entry.inputs).map(([key, value]): [string, string] => [
            key,
            JSON.stringify(value),
        ]);
        members.push(['inputs', objectText(inputs, indent + INDENT)]);
    }
    return objectText(members, indent);
};

/**
 * Serialize a manifest deterministically: file paths and inputs are sorted by UTF-16 code unit,
 * so regenerating in a different order produces the same text. Each entry is written as its
 * `hash` or `signature`, then its `inputs`.
 *
 * @param files - entries by path relative to the manifest's directory
 * @returns manifest file content
 */
export const serializeManifest = (files: Readonly<Record<string, ManifestEntry>>): string => {
    const entries = sortedEntries(files).map(([path, entry]): [string, string] => [
        path,
        entryText(entry, INDENT + INDENT),
    ]);
    const manifest = objectText(
        [
            ['version', JSON.stringify(VERSION)],
            ['files', objectText(entries, INDENT)],
        ],
        ''
    );
    return `${manifest}\n`;
};

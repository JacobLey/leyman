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
    for (const [path, entry] of Object.entries(files)) {
        if (!isEntry(entry)) {
            throw new GeneratedSignatureManifestError(`invalid entry for ${path}`);
        }
    }
    return { version, files: files as Record<string, ManifestEntry> };
};

const sortKeys = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => (a < b ? -1 : 1)));

/**
 * Serialize a manifest deterministically: file paths and inputs are sorted, so regenerating in
 * a different order produces the same text.
 *
 * @param files - entries by path relative to the manifest's directory
 * @returns manifest file content
 */
export const serializeManifest = (files: Readonly<Record<string, ManifestEntry>>): string => {
    const sortedFiles = Object.fromEntries(
        Object.entries(sortKeys(files)).map(([path, entry]) => [
            path,
            entry.inputs ? { ...entry, inputs: sortKeys(entry.inputs) } : entry,
        ])
    );
    const manifest = { version: VERSION, files: sortedFiles } satisfies Manifest;
    return `${JSON.stringify(manifest, null, 2)}\n`;
};

import type { ManifestEntry } from 'generated-signature';
import type { NormalizedParams } from './lib/types.js';
import Path from 'node:path';
import { uint8ArrayToString } from 'uint8array-extras';
import { formatText } from 'format-file';
import {
    contentHash,
    GeneratedSignatureManifestError,
    parseManifest,
    serializeManifest,
    verifyManifestEntry,
} from 'generated-signature';
import { PopulateFilesOwnershipError } from './lib/errors.js';
import { safeLoadFile } from './loader.js';

/**
 * Manifest entries by absolute file path.
 */
export type ManifestEntries = ReadonlyMap<string, ManifestEntry>;

const slashed = (filePath: string): string => filePath.replaceAll(Path.sep, '/');

/**
 * Compare distinct paths by UTF-16 code unit, with `/` separators on every platform: the order a
 * manifest lists them in, so files are visited (and reported) in an order that doesn't depend on
 * how they were found.
 *
 * @param a - path
 * @param b - another path
 * @returns negative or positive
 */
export const comparePaths = (a: string, b: string): number =>
    // eslint-disable-next-line sonarjs/strings-comparison -- code unit order is the point, not a locale's
    slashed(a) < slashed(b) ? -1 : 1;

/**
 * Read a manifest, if it exists.
 *
 * Paths are kept exactly as listed, with no Unicode normalization. Two listed paths that resolve
 * to the same file (like `a.json` and `./a.json`) are an error rather than one silently winning:
 * populate-files never writes them, so the manifest was edited by hand.
 *
 * @param manifestPath - absolute path of the manifest
 * @returns entries by absolute path, empty if there is no manifest yet
 * @rejects {GeneratedSignatureManifestError} if the manifest is invalid, or lists a file twice
 */
export const loadManifest = async (manifestPath: string): Promise<ManifestEntries> => {
    const raw = await safeLoadFile(manifestPath);
    if (raw === null) {
        return new Map();
    }
    const { files } = parseManifest(uint8ArrayToString(raw));
    const dir = Path.dirname(manifestPath);
    const entries = new Map<string, ManifestEntry>();
    const listedAs = new Map<string, string>();
    // Sorted, so the error names the same pair whatever order the manifest holds them in
    const sorted = Object.entries(files).toSorted(([a], [b]) => comparePaths(a, b));
    for (const [relative, entry] of sorted) {
        const filePath = Path.resolve(dir, relative);
        const other = listedAs.get(filePath);
        if (other !== undefined) {
            throw new GeneratedSignatureManifestError(
                `${manifestPath} lists ${other} and ${relative}, which are the same file`
            );
        }
        listedAs.set(filePath, relative);
        entries.set(filePath, entry);
    }
    return entries;
};

/**
 * The manifest entry recording a file this run writes.
 *
 * @param params - normalized file params
 * @returns entry: signed files are checked by their own token, others by hash
 */
export const entryFor = (params: NormalizedParams): ManifestEntry => {
    const inputs = params.inputs ? { inputs: params.inputs } : {};
    return params.signed
        ? { signature: 'inline', ...inputs }
        : { hash: contentHash(params.content), ...inputs };
};

/**
 * Refuse to replace (or delete) an unsigned file that the manifest doesn't say is ours, unchanged.
 * Signed files are checked by their own token instead.
 *
 * @param params - file to check
 * @param params.filePath - absolute path
 * @param params.existing - current content
 * @param params.entry - the file's entry in the previous manifest, if any
 * @throws {PopulateFilesOwnershipError} if the file is not listed, or was edited
 */
export const assertOwnedByManifest = ({
    filePath,
    existing,
    entry,
}: {
    filePath: string;
    existing: Uint8Array;
    entry: ManifestEntry | undefined;
}): void => {
    if (!entry) {
        throw new PopulateFilesOwnershipError({
            filePath,
            reason: 'not-owned',
            detail: 'not listed in the manifest',
        });
    }
    if (verifyManifestEntry(existing, entry).status !== 'valid') {
        throw new PopulateFilesOwnershipError({ filePath, reason: 'edited' });
    }
};

/**
 * Render the manifest for a set of entries.
 *
 * @param manifestPath - absolute path of the manifest
 * @param entries - entries by absolute path
 * @returns formatted manifest content
 */
export const renderManifest = async (
    manifestPath: string,
    entries: ManifestEntries
): Promise<string> => {
    const dir = Path.dirname(manifestPath);
    const files = Object.fromEntries(
        entries.entries().map(([filePath, entry]) => [slashed(Path.relative(dir, filePath)), entry])
    );
    return formatText(serializeManifest(files), { ext: '.json' });
};

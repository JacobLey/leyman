import type { ManifestEntry } from 'generated-signature';
import type { NormalizedParams } from './lib/types.js';
import Path from 'node:path';
import { uint8ArrayToString } from 'uint8array-extras';
import { formatText } from 'format-file';
import {
    contentHash,
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

/**
 * Read a manifest, if it exists.
 *
 * @param manifestPath - absolute path of the manifest
 * @returns entries by absolute path, empty if there is no manifest yet
 * @throws {GeneratedSignatureManifestError} if the manifest is invalid
 */
export const loadManifest = async (manifestPath: string): Promise<ManifestEntries> => {
    const raw = await safeLoadFile(manifestPath);
    if (raw === null) {
        return new Map();
    }
    const { files } = parseManifest(uint8ArrayToString(raw));
    const dir = Path.dirname(manifestPath);
    return new Map(
        Object.entries(files).map(([relative, entry]) => [Path.resolve(dir, relative), entry])
    );
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
        entries
            .entries()
            .map(([filePath, entry]) => [
                Path.relative(dir, filePath).replaceAll(Path.sep, '/'),
                entry,
            ])
    );
    return formatText(serializeManifest(files), { ext: '.json' });
};

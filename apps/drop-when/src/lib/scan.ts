import type { MalformedMarker, Marker } from './marker.js';
import { listFiles, readText } from './files.js';
import { parseMarkers } from './marker.js';

export interface ScanResult {
    /**
     * Files read, leaving out the skipped ones.
     */
    readonly files: number;
    readonly markers: readonly Marker[];
    readonly malformed: readonly MalformedMarker[];
}

/**
 * Files read at once. Reading every file at once would open thousands of descriptors in a large repository.
 */
const concurrency = 16;

/**
 * Finds every marker in the files Git lists.
 *
 * @param cwd - where Git runs
 * @param paths - Git pathspecs to scan, or all of `cwd` when empty
 * @returns markers and malformed markers, by path then line, or the error when Git can't list the files
 */
export const scan = async (
    cwd: string,
    paths: readonly string[]
): Promise<ScanResult | { readonly error: string }> => {
    const result = await listFiles(cwd, paths);
    if ('error' in result) {
        return result;
    }
    const listed = result.files;
    const texts: (string | null)[] = Array.from({ length: listed.length }, () => null);

    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < listed.length) {
            const index = next;
            next++;
            texts[index] = await readText(cwd, listed[index]!);
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    const markers: Marker[] = [];
    const malformed: MalformedMarker[] = [];
    let files = 0;
    for (const [index, text] of texts.entries()) {
        if (text === null) {
            continue;
        }
        files++;
        const parsed = parseMarkers(listed[index]!, text);
        markers.push(...parsed.markers);
        malformed.push(...parsed.malformed);
    }

    return { files, markers, malformed };
};

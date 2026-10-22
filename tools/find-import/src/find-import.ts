import type { Directory } from 'parse-cwd';
import { stat } from 'node:fs/promises';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCwd } from 'parse-cwd';

// Re-export for convenience
export type { Directory } from 'parse-cwd';

const isInside = (parent: string, target: string): boolean =>
    !Path.relative(parent, target).startsWith('..');

/**
 * Whether a file exists at `filePath`.
 *
 * @param filePath - absolute path
 * @returns true for a file, false if missing (or a directory)
 */
const isFile = async (filePath: string): Promise<boolean> => {
    try {
        const stats = await stat(filePath);
        return stats.isFile();
    } catch {
        return false;
    }
};

/**
 * Import a JS or JSON file.
 *
 * @param filePath - absolute path to an existing file
 * @returns module namespace, or the parsed JSON
 * @rejects {Error} if the file fails to load
 */
const load = async (filePath: string): Promise<unknown> => {
    // As a URL, since a path may contain characters that mean something else in one (e.g. `#`)
    const url = pathToFileURL(filePath).href;
    try {
        if (filePath.endsWith('.json')) {
            const json = (await import(url, { with: { type: 'json' } })) as { default: unknown };
            return json.default;
        }
        return await import(url);
    } catch (err) {
        throw new Error(`Failed to load ${filePath}`, { cause: err });
    }
};

/**
 * Load the first instance of JS/JSON module.
 *
 * @param fileName - name(s) of file to load
 * @param [options] - optional
 * @param [options.cwd] - bottom-most directory for search. See `parse-cwd`
 * @param [options.direction] - start searching for files from subdir->parent, defaults to `up`
 * (up, default) or parent->subdir (down).
 * @param [options.startAt] - top-most directory for searches
 * @returns filePath + content pair if found, null if none found
 * @throws {Error} if a matching file exists but fails to load (e.g. invalid JSON)
 */
export const findImport = async (
    fileName: string | string[],
    options: {
        cwd?: Directory;
        direction?: 'down' | 'up';
        startAt?: Directory;
    } = {}
): Promise<{
    filePath: string;
    content: unknown;
} | null> => {
    const fileNames = Array.isArray(fileName) ? fileName : [fileName];

    let [directory, startAt] = await Promise.all([
        parseCwd(options),
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- A missing or empty `startAt` searches up to the root
        options.startAt ? parseCwd(options.startAt) : '/',
    ]);
    let parentDirectory = Path.dirname(directory);

    const allDirectories = [directory];

    while (directory !== parentDirectory && isInside(startAt, parentDirectory)) {
        allDirectories.push(parentDirectory);

        directory = parentDirectory;
        parentDirectory = Path.dirname(directory);
    }

    if (options.direction === 'down') {
        allDirectories.reverse();
    }

    for (const basePath of allDirectories) {
        for (const file of fileNames) {
            const filePath = Path.join(basePath, file);
            // Only a missing file is skipped. One that exists but fails to load throws
            if (!(await isFile(filePath))) {
                continue;
            }
            return { filePath, content: await load(filePath) };
        }
    }
    return null;
};

import type { Directory } from 'parse-cwd';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCwd } from 'parse-cwd';

// Re-export for convenience
export type { Directory } from 'parse-cwd';

const isInside = (parent: string, target: string): boolean =>
    !Path.relative(parent, target).startsWith('..');

/**
 * Load the first instance of JS/JSON module.
 *
 * @param fileName - name(s) of file to load
 * @param [options] - optional
 * @param [options.cwd] - bottom-most directory for search. See `parse-cwd`
 * @param [options.direction=up] - start searching for files from subdir->parent
 * (up, default) or parent->subdir (down).
 * @param [options.startAt] - top-most directory for searches
 * @returns filePath + content pair if found, null if none found
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
            try {
                const filePath = Path.join(basePath, file);
                // As a URL, since a path may contain characters that mean something else in one (e.g. `#`)
                const url = pathToFileURL(filePath).href;

                if (file.endsWith('.json')) {
                    const json = (await import(url, { with: { type: 'json' } })) as {
                        default: unknown;
                    };
                    return { filePath, content: json.default };
                }

                return {
                    filePath,
                    content: await import(url),
                };
            } catch {}
        }
    }
    return null;
};

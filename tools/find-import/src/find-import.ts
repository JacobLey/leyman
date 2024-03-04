import { createRequire } from 'node:module';
import Path from 'node:path';
import { type Directory, parseCwd } from 'parse-cwd';

// Re-export for convenience
export type { Directory };

const require = createRequire(import.meta.url);

const isInside = (parent: string, target: string): boolean =>
    !Path.relative(parent, target).startsWith('..');

/**
 * Load the first instance of JS/JSON module.
 *
 * @param {string|string[]} fileName - name(s) of file to load
 * @param {object} [options] - options
 * @param {string|URL} [options.cwd] - bottom-most directory for search. See `parse-cwd`
 * @param {string|URL} [options.direction=up] - start searching for files from subdir->parent
 *                                              (up, default) or parent->subdir (down).
 * @param {string|URL} [options.startAt] - top-most directory for searches
 * @returns {object|null} filePath + content pair if found, null if none found
 */
export const findImport = async <T>(
    fileName: string | string[],
    options: {
        cwd?: Directory;
        direction?: 'down' | 'up';
        startAt?: Directory;
    } = {}
): Promise<{
    filePath: string;
    content: T;
} | null> => {
    const fileNames = Array.isArray(fileName) ? fileName : [fileName];

    let [directory, startAt] = await Promise.all([
        parseCwd(options),
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        options.startAt ? parseCwd(options.startAt) : '/',
    ]);
    let parentDirectory = Path.dirname(directory);

    const allDirectories = [directory];

    while (
        directory !== parentDirectory &&
        isInside(startAt, parentDirectory)
    ) {
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

                // In future could parallel `import` json (once experimental warnings disabled)
                if (file.endsWith('.json')) {
                    // eslint-disable-next-line import/no-dynamic-require
                    const json = require(filePath) as T;
                    return {
                        filePath,
                        content: json,
                    };
                }

                const js = (await import(filePath)) as T;
                return {
                    filePath,
                    content: js,
                };
            } catch {}
        }
    }
    return null;
};

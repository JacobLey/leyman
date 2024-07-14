import { createRequire } from 'node:module';
import Path from 'node:path';
import { type Directory, parseCwd } from 'parse-cwd';

// Re-export for convenience
export type { Directory } from 'parse-cwd';

const require = createRequire(import.meta.url);

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
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

                // In future could parallel `import` json (once experimental warnings disabled)
                if (file.endsWith('.json')) {
                    return {
                        filePath,
                        // eslint-disable-next-line import/no-dynamic-require
                        content: require(filePath),
                    };
                }

                return {
                    filePath,
                    content: await import(filePath),
                };
            } catch {}
        }
    }
    return null;
};

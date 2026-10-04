import Path from 'node:path';
import { globby } from 'globby';
import { isExplicitlyModuleDirectory } from './find-package-json.js';

const COMMON_OR_MODULE = '?(c|m)ts';
const DEFAULT_OR_COMMON = '?(c)ts';
const COMMON_ONLY = 'cts';

/**
 * Load all index files contained within the directory.
 *
 * Ignores .gitignored files, as well as any files/blobs explicitly directed to ignore.
 *
 * @param param - params
 * @param param.dir - directory to search
 * @param param.ignore - files/blobs to exclude from results
 * @returns list of found filenames
 */
export const findIndexFiles = async ({
    dir,
    ignore,
}: {
    dir: string;
    ignore: string[];
}): Promise<string[]> =>
    globby(
        [
            '**/index.?(c|m)ts',
            '!**/node_modules/**',
            ...ignore.map(i => `!${i.replaceAll(Path.win32.sep, '/')}`),
        ],
        {
            cwd: dir,
            gitignore: true,
        }
    );

/**
 * Extensions an index file may re-export, based on its own extension and package type.
 *
 * @param filePath - path to index file
 * @returns glob of extensions
 */
const getExtensions = async (filePath: string): Promise<string> => {
    if (filePath.endsWith('.mts')) {
        return COMMON_OR_MODULE;
    }
    if (filePath.endsWith('.ts')) {
        if (await isExplicitlyModuleDirectory(filePath)) {
            return COMMON_OR_MODULE;
        }
        return DEFAULT_OR_COMMON;
    } else if (await isExplicitlyModuleDirectory(filePath)) {
        return COMMON_ONLY;
    }
    return DEFAULT_OR_COMMON;
};

/**
 * Load all sibling files that should be re-exported by the index file.
 *
 * @param filePath - path to index file
 * @returns list of sibling filenames
 */
export const findFilesForIndex = async (filePath: string): Promise<string[]> => {
    const extensions = await getExtensions(filePath);
    return globby([`*.${extensions}`, '!index.?(c|m)ts'], {
        cwd: Path.dirname(filePath),
        gitignore: true,
    });
};

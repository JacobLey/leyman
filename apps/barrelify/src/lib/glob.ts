import type { IsGitignored } from './gitignore.js';
import Path from 'node:path';
import { glob } from 'tinyglobby';
import { isExplicitlyModuleDirectory } from './find-package-json.js';

// `.tsx` compiles like `.ts`: to `.js`, in the module system of the nearest package.json
const COMMON_OR_MODULE = '@(ts|cts|mts|tsx)';
const DEFAULT_OR_COMMON = '@(ts|cts|tsx)';
const COMMON_ONLY = 'cts';
const INDEX = 'index.@(ts|cts|mts|tsx)';

/**
 * Load all index files contained within the directory.
 *
 * Ignores .gitignored files, as well as any files/blobs explicitly directed to ignore.
 *
 * @param param - params
 * @param param.dir - directory to search
 * @param param.ignore - files/blobs to exclude from results
 * @param param.isGitignored - gitignore rules covering `dir`
 * @returns list of found filenames, relative to `dir`
 */
export const findIndexFiles = async ({
    dir,
    ignore,
    isGitignored,
}: {
    dir: string;
    ignore: string[];
    isGitignored: IsGitignored;
}): Promise<string[]> => {
    const files = await glob(`**/${INDEX}`, {
        cwd: dir,
        expandDirectories: false,
        ignore: ['**/node_modules/**', ...ignore.map(i => i.replaceAll(Path.win32.sep, '/'))],
    });
    return files.filter(file => !isGitignored(Path.resolve(dir, file)));
};

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
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        return (await isExplicitlyModuleDirectory(filePath)) ? COMMON_OR_MODULE : DEFAULT_OR_COMMON;
    }
    return (await isExplicitlyModuleDirectory(filePath)) ? COMMON_ONLY : DEFAULT_OR_COMMON;
};

/**
 * Load all files that should be re-exported by the index file: its siblings, and with
 * `subdirectories`, the index file of each subdirectory that has one.
 *
 * @param filePath - path to index file
 * @param isGitignored - gitignore rules covering the index file
 * @param [options] - optional
 * @param [options.subdirectories] - also re-export subdirectories' index files
 * @returns list of filenames, relative to the index file's directory
 */
export const findFilesForIndex = async (
    filePath: string,
    isGitignored: IsGitignored,
    { subdirectories = false }: { subdirectories?: boolean } = {}
): Promise<string[]> => {
    const dir = Path.dirname(filePath);
    const extensions = await getExtensions(filePath);
    const files = await glob(
        [`*.${extensions}`, ...(subdirectories ? [`*/index.${extensions}`] : [])],
        {
            cwd: dir,
            expandDirectories: false,
            ignore: [INDEX, '*.d.@(ts|cts|mts)', 'node_modules/**'],
        }
    );
    return files.filter(file => !isGitignored(Path.resolve(dir, file)));
};

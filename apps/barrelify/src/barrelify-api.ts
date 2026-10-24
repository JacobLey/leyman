import type { Directory } from 'parse-cwd';
import { parseCwd } from 'parse-cwd';
import { barrelFiles } from './lib/barrel.js';

/**
 * Programatically invoke barrelify.
 * Similar as using CLI options.
 *
 * @param [options] - Optional
 * @param [options.cwd] - Directory to search for index files, defaults to `process.cwd()`. A file path means its parent directory
 * @param [options.dryRun] - If true, does not actually write files
 * @param [options.ignore] - List of globs/directories (relative to `cwd`) to ignore for finding index files
 * @returns Absolute paths of the barrel files that were updated (or would be, with `dryRun`)
 * @rejects {Error} `Directory not found: <path>` if `cwd` doesn't exist, or if a barrel's nearest `package.json` is malformed
 */
export type Barrelify = (
    this: void,
    /**
     * Optional
     */
    options?: {
        /**
         * Directory to search for index files, defaults to `process.cwd()`. A file path means its parent directory
         */
        cwd?: Directory;
        /**
         * If true, does not actually write files
         */
        dryRun?: boolean | undefined;
        /**
         * List of globs/directories (relative to `cwd`) to ignore for finding index files
         */
        ignore?: readonly string[] | undefined;
    }
) => Promise<string[]>;

export const barrelify: Barrelify = async (options = {}) =>
    barrelFiles({
        cwd: await parseCwd(options.cwd ?? null),
        dryRun: options.dryRun ?? false,
        ignore: options.ignore ?? [],
    });

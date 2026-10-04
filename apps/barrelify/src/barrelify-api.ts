import type { Directory } from 'parse-cwd';
import { parseCwd } from 'parse-cwd';
import { barrelFiles } from './lib/barrel.js';

/**
 * Programatically invoke barrelify.
 * Similar as using CLI options.
 *
 * @param [options] - Optional
 * @param [options.cwd] - Current working directory, defaults to process'
 * @param [options.dryRun] - If true, does not actually write files
 * @param [options.ignore] - List of globs/directories to ignore for finding index files
 * @returns List of updated files
 */
export type Barrelify = (
    this: void,
    /**
     * Optional
     */
    options?: {
        /**
         * Current working directory, defaults to process'
         */
        cwd?: Directory;
        /**
         * If true, does not actually write files
         */
        dryRun?: boolean;
        /**
         * List of globs/directories to ignore for finding index files
         */
        ignore?: string[];
    }
) => Promise<string[]>;

export const barrelify: Barrelify = async (options = {}) =>
    barrelFiles({
        cwd: await parseCwd(options.cwd ?? null),
        dryRun: options.dryRun ?? false,
        ignore: options.ignore ?? [],
    });

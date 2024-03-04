import { type Directory, parseCwd } from 'parse-cwd';
import { barrelFiles } from './lib/barrel.js';

/**
 * Programmatically barrel files. Scans `cwd` for `index.ts` files
 * with `// AUTO-BARREL` at the start.
 *
 * @param {object} [options] - options
 * @param {string} [options.cwd='.'] - directory to scan. Relative to process.cwd()
 * @param {boolean} [options.dryRun=false] - do not actually write file
 * @param {string[]} [options.ignore=[]] - list of files to ignore
 * @returns {Promise<string[]>} list of files that were re-written
 */
export const barrelify = async (
    options: {
        cwd?: Directory;
        dryRun?: boolean;
        ignore?: string[];
    } = {}
): Promise<string[]> => {
    const cwd = await parseCwd(options.cwd);

    return barrelFiles({
        cwd,
        dryRun: options.dryRun === true,
        ignore: options.ignore,
    });
};

import type { Directory, ParseCwd } from 'parse-cwd';
import type { Barrel } from './lib/barrel.js';

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

interface IBarrelifyApi {
    barrelify: Barrelify;
}

/**
 * Build programatic API for Barrelify.
 *
 * Parse user input and pass to internal implementation.
 */
export class BarrelifyApi implements IBarrelifyApi {
    readonly #barrel: Barrel;
    readonly #parseCwd: ParseCwd;

    public constructor(barrel: Barrel, parseCwd: ParseCwd) {
        this.#barrel = barrel;
        this.#parseCwd = parseCwd;
    }

    /**
     * @override
     */
    public async barrelify(
        options: {
            cwd?: Directory;
            dryRun?: boolean;
            ignore?: string[];
        } = {}
    ): Promise<string[]> {
        const cwd = await this.#parseCwd(options.cwd ?? null);

        return this.#barrel.barrelFiles({
            cwd,
            dryRun: options.dryRun ?? false,
            ignore: options.ignore ?? [],
        });
    }
}

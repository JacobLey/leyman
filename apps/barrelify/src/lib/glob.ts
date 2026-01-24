import type { Globby } from './dependencies.js';
import type { IsExplicitlyModuleDirectory } from './find-package-json.js';
import Path from 'node:path';

const COMMON_OR_MODULE = '?(c|m)ts';
const DEFAULT_OR_COMMON = '?(c)ts';
const COMMON_ONLY = 'cts';

/**
 * Handle loading filenames based on glob patterns.
 */
export class Glob {
    readonly #globby: Globby;
    readonly #isExplicitlyModuleDirectory: IsExplicitlyModuleDirectory;

    public constructor(globby: Globby, isExplicitlyModuleDirectory: IsExplicitlyModuleDirectory) {
        this.#globby = globby;
        this.#isExplicitlyModuleDirectory = isExplicitlyModuleDirectory;
    }

    /**
     * Load all index files contained within the directory.
     *
     * Ignores .gitignored files, as well as any files/blobs explicitly directed to ignore.
     *
     * @param param - params
     * @returns list of found filenames
     */
    public async findIndexFiles({
        dir,
        ignore,
    }: {
        /**
         * Directory to search.
         */
        dir: string;
        /**
         * Files/blobs to exclude from results
         */
        ignore: string[];
    }): Promise<string[]> {
        return this.#globby(
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
    }

    public async findFilesForIndex(filePath: string): Promise<string[]> {
        const extensions = await this.#getExtensions(filePath);
        return this.#globby([`*.${extensions}`, '!index.?(c|m)ts'], {
            cwd: Path.dirname(filePath),
            gitignore: true,
        });
    }

    async #getExtensions(filePath: string): Promise<string> {
        if (filePath.endsWith('.mts')) {
            return COMMON_OR_MODULE;
        }
        if (filePath.endsWith('.ts')) {
            if (await this.#isExplicitlyModuleDirectory(filePath)) {
                return COMMON_OR_MODULE;
            }
            return DEFAULT_OR_COMMON;
        } else if (await this.#isExplicitlyModuleDirectory(filePath)) {
            return COMMON_ONLY;
        }
        return DEFAULT_OR_COMMON;
    }
}

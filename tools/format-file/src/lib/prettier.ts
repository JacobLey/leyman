import type { resolveConfig } from 'prettier';
import type { CanUseFormatter } from '#types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prettierPath } from './lib-path.js';

const execFileAsync = promisify(execFile);

/**
 * Prettier is an optional peer dependency, so only load it when actually needed.
 *
 * @returns function to locate a prettier config file
 */
const getPrettierResolveConfig = async (): Promise<typeof resolveConfig> => {
    const prettier = await import('prettier');
    return prettier.resolveConfig;
};

/**
 * Prettier formatter.
 *
 * Path and config lookups are injectable so tests can simulate prettier being uninstalled or unconfigured.
 */
export class Prettier {
    readonly #getPrettierPath: () => string;
    readonly #getResolveConfig: () => Promise<typeof resolveConfig>;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: string[]) => Promise<void>;

    public constructor(
        getPrettierPath: () => string = prettierPath,
        getResolveConfig: () => Promise<typeof resolveConfig> = getPrettierResolveConfig
    ) {
        this.#getPrettierPath = getPrettierPath;
        this.#getResolveConfig = getResolveConfig;

        this.canUsePrettier = this.#canUsePrettier.bind(this);
        this.formatPrettierFiles = this.#formatPrettierFiles.bind(this);
    }

    async #canUsePrettier(): Promise<CanUseFormatter> {
        try {
            this.#getPrettierPath();
        } catch {
            return 0;
        }

        try {
            const configResolver = await this.#getResolveConfig();
            if (await configResolver('.')) {
                return 2;
            }
        } catch {}

        return 1;
    }

    async #formatPrettierFiles(files: string[]): Promise<void> {
        await execFileAsync(this.#getPrettierPath(), [...files, '--write']);
    }
}

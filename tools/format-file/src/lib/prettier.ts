import type { Supplier } from 'haywire';
import type { CanUseFormatter } from '#types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Prettier formatter.
 *
 * Prettier is an optional peer dependency, so its path is injected to allow simulating it being uninstalled.
 */
export class Prettier {
    readonly #getPrettierPath: Supplier<string>;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: string[]) => Promise<void>;

    public constructor(getPrettierPath: Supplier<string>) {
        this.#getPrettierPath = getPrettierPath;

        this.canUsePrettier = this.#canUsePrettier.bind(this);
        this.formatPrettierFiles = this.#formatPrettierFiles.bind(this);
    }

    async #canUsePrettier(): Promise<CanUseFormatter> {
        try {
            this.#getPrettierPath();
        } catch {
            return 0;
        }

        // Only load prettier once known to be installed
        const { resolveConfigFile } = await import('prettier');
        if (await resolveConfigFile()) {
            return 2;
        }
        return 1;
    }

    async #formatPrettierFiles(files: string[]): Promise<void> {
        await execFileAsync(this.#getPrettierPath(), [...files, '--write']);
    }
}

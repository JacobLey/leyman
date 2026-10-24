import type { Supplier } from 'haywire';
import type { CanUseFormatter } from '#types';
import { execFileAsync, execWithInput } from './exec.js';

/**
 * Prettier formatter.
 *
 * Prettier is an optional peer dependency, so its path is injected to allow simulating it being uninstalled.
 *
 * Every file passed is formatted, including ones that `.gitignore` lists: only `.prettierignore` is read.
 */
export class Prettier {
    readonly #getPrettierPath: Supplier<string>;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: readonly string[]) => Promise<void>;
    public readonly formatPrettierText: (text: string, filePath: string) => Promise<string>;

    public constructor(getPrettierPath: Supplier<string>) {
        this.#getPrettierPath = getPrettierPath;

        this.canUsePrettier = this.#canUsePrettier.bind(this);
        this.formatPrettierFiles = this.#formatPrettierFiles.bind(this);
        this.formatPrettierText = this.#formatPrettierText.bind(this);
    }

    async #canUsePrettier(): Promise<CanUseFormatter> {
        try {
            this.#getPrettierPath();
        } catch {
            return 0;
        }

        // Only load prettier once known to be installed
        const { resolveConfigFile } = await import('prettier');
        return (await resolveConfigFile()) === null ? 1 : 2;
    }

    async #formatPrettierFiles(files: readonly string[]): Promise<void> {
        await execFileAsync(this.#getPrettierPath(), [
            ...files,
            '--ignore-path=.prettierignore',
            '--write',
        ]);
    }

    async #formatPrettierText(text: string, filePath: string): Promise<string> {
        return execWithInput(
            this.#getPrettierPath(),
            ['--ignore-path=.prettierignore', '--stdin-filepath', filePath],
            text
        );
    }
}

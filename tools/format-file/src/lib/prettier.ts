import type { resolveConfig } from 'prettier';
import type { CanUseFormatter, Executor } from '#types';

/**
 * Prettier formatter.
 */
export class Prettier {

    readonly #executor: Executor;
    readonly #getPrettierPath: () => string;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: string[]) => Promise<void>;

    public constructor(
        executor: Executor,
        getPrettierPath: () => string
    ) {
        this.#executor = executor;
        this.#getPrettierPath = getPrettierPath;
        this.canUsePrettier = this.#canUsePrettier.bind(this);
        this.formatPrettierFiles = this.#formatPrettierFiles.bind(this);
    }

    async #canUsePrettier(): Promise<CanUseFormatter> {
        let configResolver: typeof resolveConfig;

        try {
            this.#getPrettierPath();
            const prettier = await import('prettier');
            configResolver = prettier.resolveConfig;
        } catch {
            return 0;
        }

        const options = await configResolver('.');
        if (options) {
            return 2;
        }
        return 1;
    }

    async #formatPrettierFiles(files: string[]): Promise<void> {
        await this.#executor(this.#getPrettierPath(), [...files, '--write']);
    }
}

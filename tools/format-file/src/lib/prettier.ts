import type { resolveConfig } from 'prettier';
import type { CanUseFormatter, Executor } from '#types';

/**
 * Prettier formatter.
 */
export class Prettier {
    readonly #executor: Executor;
    readonly #getPrettierPath: () => string;
    readonly #getResolveConfig: () => Promise<typeof resolveConfig>;

    public readonly canUsePrettier: () => Promise<CanUseFormatter>;
    public readonly formatPrettierFiles: (files: string[]) => Promise<void>;

    public constructor(
        executor: Executor,
        getPrettierPath: () => string,
        getResolveConfig: () => Promise<typeof resolveConfig>
    ) {
        this.#executor = executor;
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
        await this.#executor(this.#getPrettierPath(), [...files, '--write']);
    }
}

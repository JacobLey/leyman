import type { findUp } from 'find-up';
import type { CanUseFormatter, Executor } from '#types';

/**
 * Biome formatter.
 */
export class Biome {
    readonly #executor: Executor;
    readonly #findUp: typeof findUp;
    readonly #getBiomePath: () => string;

    public readonly canUseBiome: () => Promise<CanUseFormatter>;
    public readonly formatBiomeFiles: (files: string[]) => Promise<void>;

    public constructor(executor: Executor, find: typeof findUp, getBiomePath: () => string) {
        this.#executor = executor;
        this.#findUp = find;
        this.#getBiomePath = getBiomePath;

        this.canUseBiome = this.#canUseBiome.bind(this);
        this.formatBiomeFiles = this.#formatBiomeFiles.bind(this);
    }

    async #canUseBiome(): Promise<CanUseFormatter> {
        try {
            this.#getBiomePath();
        } catch {
            return 0;
        }

        const file = await this.#findUp(['biome.json', 'biome.jsonc']);
        if (file) {
            return 2;
        }
        return 1;
    }

    async #formatBiomeFiles(files: string[]): Promise<void> {
        await this.#executor(this.#getBiomePath(), ['format', '--write', ...files]);
    }
}

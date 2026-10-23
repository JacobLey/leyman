import type { Supplier } from 'haywire';
import type { CanUseFormatter } from '#types';
import { findUp } from 'find-up';
import { execFileAsync, execWithInput } from './exec.js';

/**
 * Biome formatter.
 *
 * Biome is an optional peer dependency, so its path is injected to allow simulating it being uninstalled.
 */
export class Biome {
    readonly #getBiomePath: Supplier<string>;

    public readonly canUseBiome: () => Promise<CanUseFormatter>;
    public readonly formatBiomeFiles: (files: string[]) => Promise<void>;
    public readonly formatBiomeText: (text: string, filePath: string) => Promise<string>;

    public constructor(getBiomePath: Supplier<string>) {
        this.#getBiomePath = getBiomePath;

        this.canUseBiome = this.#canUseBiome.bind(this);
        this.formatBiomeFiles = this.#formatBiomeFiles.bind(this);
        this.formatBiomeText = this.#formatBiomeText.bind(this);
    }

    async #canUseBiome(): Promise<CanUseFormatter> {
        try {
            this.#getBiomePath();
        } catch {
            return 0;
        }

        const file = await findUp(['biome.json', 'biome.jsonc']);
        return file === undefined ? 1 : 2;
    }

    async #formatBiomeFiles(files: string[]): Promise<void> {
        await execFileAsync(this.#getBiomePath(), ['format', '--write', ...files]);
    }

    async #formatBiomeText(text: string, filePath: string): Promise<string> {
        return execWithInput(
            this.#getBiomePath(),
            ['format', `--stdin-file-path=${filePath}`],
            text
        );
    }
}

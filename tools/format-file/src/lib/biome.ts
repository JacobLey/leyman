import type { Supplier } from 'haywire';
import type { CanUseFormatter } from '#types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findUp } from 'find-up';

const execFileAsync = promisify(execFile);

/**
 * Biome formatter.
 *
 * Biome is an optional peer dependency, so its path is injected to allow simulating it being uninstalled.
 */
export class Biome {
    readonly #getBiomePath: Supplier<string>;

    public readonly canUseBiome: () => Promise<CanUseFormatter>;
    public readonly formatBiomeFiles: (files: string[]) => Promise<void>;

    public constructor(getBiomePath: Supplier<string>) {
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

        const file = await findUp(['biome.json', 'biome.jsonc']);
        if (file) {
            return 2;
        }
        return 1;
    }

    async #formatBiomeFiles(files: string[]): Promise<void> {
        await execFileAsync(this.#getBiomePath(), ['format', '--write', ...files]);
    }
}

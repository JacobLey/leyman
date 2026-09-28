import type { CanUseFormatter } from '#types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findUp } from 'find-up';
import { biomePath } from './lib-path.js';

const execFileAsync = promisify(execFile);

/**
 * Biome formatter.
 *
 * Path and config lookups are injectable so tests can simulate biome being uninstalled or unconfigured.
 */
export class Biome {
    readonly #getBiomePath: () => string;
    readonly #findUp: typeof findUp;

    public readonly canUseBiome: () => Promise<CanUseFormatter>;
    public readonly formatBiomeFiles: (files: string[]) => Promise<void>;

    public constructor(getBiomePath: () => string = biomePath, find: typeof findUp = findUp) {
        this.#getBiomePath = getBiomePath;
        this.#findUp = find;

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
        await execFileAsync(this.#getBiomePath(), ['format', '--write', ...files]);
    }
}

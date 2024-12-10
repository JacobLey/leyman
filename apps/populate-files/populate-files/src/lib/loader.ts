import type { readFile as ReadFile } from 'node:fs/promises';

/**
 * Read file bytes, and will simply resolve with null
 * if file reading fails, most likely due to non-existence.
 */
export type SafeLoadFile = (filePath: string) => Promise<Uint8Array | null>;

/**
 * Container class for generating safeLoadFile
 */
export class Loader {
    readonly #readFile: typeof ReadFile;

    public readonly safeLoadFile: SafeLoadFile;

    public constructor(readFile: typeof ReadFile) {
        this.#readFile = readFile;

        this.safeLoadFile = this.#safeLoadFile.bind(this);
    }

    async #safeLoadFile(filePath: string): Promise<Uint8Array | null> {
        try {
            return await this.#readFile(filePath);
        } catch {
            return null;
        }
    }
}

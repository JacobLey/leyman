import type { CanUseFormatter, FileFormatterOptions, FilesFormatter } from '#types';
import { Formatters } from '#types';

/**
 * Core formatting logic using injecting formatter-specific handlers.
 */
export class Formatter {
    readonly #canUseBiome: () => Promise<CanUseFormatter>;
    readonly #formatBiomeFiles: (files: string[]) => Promise<void>;
    readonly #canUsePrettier: () => Promise<CanUseFormatter>;
    readonly #formatPrettierFiles: (files: string[]) => Promise<void>;

    public readonly formatFiles: FilesFormatter;

    public constructor(
        canUseBiome: () => Promise<CanUseFormatter>,
        formatBiomeFiles: (files: string[]) => Promise<void>,
        canUsePrettier: () => Promise<CanUseFormatter>,
        formatPrettierFiles: (files: string[]) => Promise<void>
    ) {
        this.#canUseBiome = canUseBiome;
        this.#formatBiomeFiles = formatBiomeFiles;
        this.#canUsePrettier = canUsePrettier;
        this.#formatPrettierFiles = formatPrettierFiles;

        this.formatFiles = this.#formatFiles.bind(this);
    }

    async #formatFiles(files: string[], options: FileFormatterOptions = {}): Promise<void> {
        if (files.length === 0) {
            return;
        }
        const formatter = options.formatter ?? Formatters.INHERIT;

        const [biomeUsability, prettierUsability] = await Promise.all([
            this.#canUseBiome(),
            this.#canUsePrettier(),
        ]);

        const formatters = [
            {
                name: Formatters.BIOME,
                usable: biomeUsability,
                format: this.#formatBiomeFiles,
            },
            {
                name: Formatters.PRETTIER,
                usable: prettierUsability,
                format: this.#formatPrettierFiles,
            },
        ]
            .filter(({ name }) => {
                if (formatter === Formatters.INHERIT) {
                    return true;
                }
                return formatter === name;
            })
            .filter(({ usable }) => usable > 0)
            .sort((a, b) => b.usable - a.usable);

        for (const { format } of formatters) {
            try {
                await format(files);
                return;
            } catch {}
        }
    }
}

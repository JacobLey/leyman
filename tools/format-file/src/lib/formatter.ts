import type {
    CanUseFormatter,
    FileFormatter,
    FileFormatterOptions,
    FilesFormatter,
    TextFormatter,
    TextFormatterOptions,
} from '#types';
import type { Biome } from './biome.js';
import type { Prettier } from './prettier.js';
import Path from 'node:path';

/**
 * Core formatting logic, choosing between available formatters.
 */
export class Formatter {
    readonly #biome: Biome;
    readonly #prettier: Prettier;

    /**
     * Formatter availability is determined once and reused,
     * as installation/configuration is not expected to change during the process.
     */
    #usability: Promise<[CanUseFormatter, CanUseFormatter]> | null = null;

    public readonly formatFiles: FilesFormatter;
    public readonly formatFile: FileFormatter;
    public readonly formatText: TextFormatter;

    public constructor(biome: Biome, prettier: Prettier) {
        this.#biome = biome;
        this.#prettier = prettier;

        this.formatFiles = this.#formatFiles.bind(this);
        this.formatFile = this.#formatFile.bind(this);
        this.formatText = this.#formatText.bind(this);
    }

    async #formatFiles(files: string[], options: FileFormatterOptions = {}): Promise<void> {
        if (files.length === 0) {
            return;
        }
        const formatters = await this.#getFormatters(options);
        for (const { formatFiles } of formatters) {
            try {
                await formatFiles(files);
                return;
            } catch {
                // This formatter isn't installed, or failed: try the next
            }
        }
    }

    async #formatFile(filePath: string, options?: FileFormatterOptions): Promise<void> {
        return this.#formatFiles([filePath], options);
    }

    async #formatText(text: string, options: TextFormatterOptions = {}): Promise<string> {
        // Formatted as if it were a file in the working directory, so that the project's configuration applies
        const filePath = Path.resolve(`format-file${options.ext ?? '.js'}`);
        const formatters = await this.#getFormatters(options);
        for (const { formatText } of formatters) {
            try {
                return await formatText(text, filePath);
            } catch {
                // This formatter isn't installed, or failed: try the next
            }
        }
        return text;
    }

    /**
     * Formatters to try in order: the requested one, or every usable one, configured first.
     *
     * @param options - which formatter to use, if not every usable one
     * @returns formatters, most preferred first
     */
    async #getFormatters({ formatter = 'inherit' }: FileFormatterOptions): Promise<
        {
            formatFiles: (files: string[]) => Promise<void>;
            formatText: (text: string, filePath: string) => Promise<string>;
        }[]
    > {
        this.#usability ??= Promise.all([
            this.#biome.canUseBiome(),
            this.#prettier.canUsePrettier(),
        ]);
        const [biomeUsability, prettierUsability] = await this.#usability;
        // `null` also inherits
        const requested = formatter ?? 'inherit';

        return [
            {
                name: 'biome',
                usable: biomeUsability,
                formatFiles: this.#biome.formatBiomeFiles,
                formatText: this.#biome.formatBiomeText,
            },
            {
                name: 'prettier',
                usable: prettierUsability,
                formatFiles: this.#prettier.formatPrettierFiles,
                formatText: this.#prettier.formatPrettierText,
            },
        ]
            .filter(({ name }) => requested === 'inherit' || requested === name)
            .filter(({ usable }) => usable > 0)
            .toSorted((a, b) => b.usable - a.usable);
    }
}

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

interface NamedFormatter {
    name: string;
    formatFiles: (files: readonly string[]) => Promise<void>;
    formatText: (text: string, filePath: string) => Promise<string>;
}

/**
 * Whether a file is Markdown. Unless a project opts in with `markdown.parser.frontmatter`, Biome formats YAML frontmatter
 * as a heading, so only Prettier formats Markdown.
 *
 * @param filePath - file to check, by its extension
 * @returns true if Markdown
 */
const isMarkdown = (filePath: string): boolean => /\.(?:markdown|md)$/iv.test(filePath);

/**
 * Formatters that may format Markdown.
 *
 * @param formatters - formatters to choose from
 * @returns formatters other than Biome
 */
const markdownFormatters = (formatters: readonly NamedFormatter[]): readonly NamedFormatter[] =>
    formatters.filter(({ name }) => name !== 'biome');

/**
 * Format files with the first formatter that succeeds. Without files, no formatter runs.
 *
 * @param files - files to format
 * @param formatters - formatters to try in order
 */
const tryFormatFiles = async (
    files: readonly string[],
    formatters: readonly NamedFormatter[]
): Promise<void> => {
    if (files.length === 0) {
        return;
    }
    for (const { formatFiles } of formatters) {
        try {
            await formatFiles(files);
            return;
        } catch {
            // This formatter isn't installed, or failed: try the next
        }
    }
};

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

    async #formatFiles(
        files: readonly string[],
        options: FileFormatterOptions = {}
    ): Promise<void> {
        const formatters = await this.#getFormatters(options);
        await tryFormatFiles(
            files.filter(file => !isMarkdown(file)),
            formatters
        );
        await tryFormatFiles(
            files.filter(file => isMarkdown(file)),
            markdownFormatters(formatters)
        );
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
    async #getFormatters({
        formatter = 'inherit',
    }: FileFormatterOptions): Promise<NamedFormatter[]> {
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

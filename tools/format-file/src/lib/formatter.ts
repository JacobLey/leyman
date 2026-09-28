import type {
    CanUseFormatter,
    FileFormatter,
    FileFormatterOptions,
    FilesFormatter,
    TextFormatter,
    TextFormatterOptions,
} from '#types';
import { readFile, writeFile } from 'node:fs/promises';
import { file } from 'tmp-promise';
import { Biome } from './biome.js';
import { Prettier } from './prettier.js';

type BiomeFormatter = Pick<Biome, 'canUseBiome' | 'formatBiomeFiles'>;
type PrettierFormatter = Pick<Prettier, 'canUsePrettier' | 'formatPrettierFiles'>;

/**
 * Core formatting logic, choosing between available formatters.
 *
 * Formatters are injectable so tests can exercise selection and fallback behavior,
 * which is not reproducible with the real (always installed) formatters.
 */
export class Formatter {
    readonly #biome: BiomeFormatter;
    readonly #prettier: PrettierFormatter;

    /**
     * Formatter availability is determined once and reused,
     * as installation/configuration is not expected to change during the process.
     */
    #usability: Promise<[CanUseFormatter, CanUseFormatter]> | null = null;

    public readonly formatFiles: FilesFormatter;
    public readonly formatFile: FileFormatter;
    public readonly formatText: TextFormatter;

    public constructor(
        biome: BiomeFormatter = new Biome(),
        prettier: PrettierFormatter = new Prettier()
    ) {
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
        const formatter = options.formatter ?? 'inherit';

        this.#usability ??= Promise.all([
            this.#biome.canUseBiome(),
            this.#prettier.canUsePrettier(),
        ]);
        const [biomeUsability, prettierUsability] = await this.#usability;

        const formatters = [
            {
                name: 'biome',
                usable: biomeUsability,
                format: this.#biome.formatBiomeFiles,
            },
            {
                name: 'prettier',
                usable: prettierUsability,
                format: this.#prettier.formatPrettierFiles,
            },
        ]
            .filter(({ name }) => {
                if (formatter === 'inherit') {
                    return true;
                }
                return formatter === name;
            })
            .filter(({ usable }) => usable > 0)
            .toSorted((a, b) => b.usable - a.usable);

        for (const { format } of formatters) {
            try {
                await format(files);
                return;
            } catch {}
        }
    }

    async #formatFile(filePath: string, options?: FileFormatterOptions): Promise<void> {
        return this.#formatFiles([filePath], options);
    }

    async #formatText(text: string, options: TextFormatterOptions = {}): Promise<string> {
        const tmpFile = await file({
            prefix: 'format-file',
            postfix: options.ext ?? '.js',
        });

        await writeFile(tmpFile.path, text, 'utf8');
        await this.#formatFiles([tmpFile.path], { formatter: options.formatter });
        const formatted = await readFile(tmpFile.path, 'utf8');

        await tmpFile.cleanup();

        return formatted;
    }
}

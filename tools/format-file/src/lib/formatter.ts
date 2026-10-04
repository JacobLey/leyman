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
import { readFile, writeFile } from 'node:fs/promises';
import { file } from 'tmp-promise';

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

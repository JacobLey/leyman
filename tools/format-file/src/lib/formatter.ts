import type fs from 'node:fs/promises';
import type { file } from 'tmp-promise';
import type {
    CanUseFormatter,
    FileFormatter,
    FileFormatterOptions,
    FilesFormatter,
    TextFormatter,
    TextFormatterOptions,
} from '#types';

/**
 * Dependency injected instance that exposes bound implementations of
 * formatters for external use.
 */
export class Formatter {
    readonly #canUseBiome: () => Promise<CanUseFormatter>;
    readonly #formatBiomeFiles: (files: string[]) => Promise<void>;
    readonly #canUsePrettier: () => Promise<CanUseFormatter>;
    readonly #formatPrettierFiles: (files: string[]) => Promise<void>;
    readonly #readFile: typeof fs.readFile;
    readonly #writeFile: typeof fs.writeFile;
    readonly #tmpFileFactory: typeof file;

    public readonly formatFiles: FilesFormatter;
    public readonly formatFile: FileFormatter;
    public readonly formatText: TextFormatter;

    public constructor(
        canUseBiome: () => Promise<CanUseFormatter>,
        formatBiomeFiles: (files: string[]) => Promise<void>,
        canUsePrettier: () => Promise<CanUseFormatter>,
        formatPrettierFiles: (files: string[]) => Promise<void>,
        readFile: typeof fs.readFile,
        writeFile: typeof fs.writeFile,
        tmpFileFactory: typeof file
    ) {
        this.#canUseBiome = canUseBiome;
        this.#formatBiomeFiles = formatBiomeFiles;
        this.#canUsePrettier = canUsePrettier;
        this.#formatPrettierFiles = formatPrettierFiles;
        this.#readFile = readFile;
        this.#writeFile = writeFile;
        this.#tmpFileFactory = tmpFileFactory;

        this.formatFiles = this.#formatFiles.bind(this);
        this.formatFile = this.#formatFile.bind(this);
        this.formatText = this.#formatText.bind(this);
    }

    async #formatFiles(files: string[], { formatter = 'inherit' }: FileFormatterOptions = {}): Promise<void> {
        const [biomeUsability, prettierUsability] = await Promise.all([
            this.#canUseBiome(),
            this.#canUsePrettier(),
        ]);

        const formatters = [
            {
                name: 'biome' as const,
                usable: biomeUsability,
                format: this.#formatBiomeFiles,
            },
            {
                name: 'prettier' as const,
                usable: prettierUsability,
                format: this.#formatPrettierFiles,
            },
        ]
            .filter(({ name }) => {
                if (formatter === 'inherit') {
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

    async #formatFile(file: string, options?: FileFormatterOptions): Promise<void> {
        return this.#formatFiles([file], options);
    }

    async #formatText(text: string, options: TextFormatterOptions = {}): Promise<string> {
        const tmpFile = await this.#tmpFileFactory({
            prefix: 'format-file',
            postfix: options.ext ?? '.js',
        });

        await this.#writeFile(tmpFile.path, text, 'utf8');
        await this.#formatFiles([tmpFile.path], { formatter: options.formatter });
        const formatted = await this.#readFile(tmpFile.path, 'utf8');

        await tmpFile.cleanup();

        return formatted;
    }
}

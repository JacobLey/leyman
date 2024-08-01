import type fs from 'node:fs/promises';
import type { file } from 'tmp-promise';
import type {
    FileFormatter,
    FileFormatterOptions,
    FilesFormatter,
    TextFormatter,
    TextFormatterOptions,
} from '#types';

/**
 * Additional formatter logic that extends core formatter.
 */
export class FormatterWrapper {
    readonly #formatFiles: FilesFormatter;
    readonly #readFile: typeof fs.readFile;
    readonly #writeFile: typeof fs.writeFile;
    readonly #tmpFileFactory: typeof file;

    public readonly formatFile: FileFormatter;
    public readonly formatText: TextFormatter;

    public constructor(
        formatFiles: FilesFormatter,
        readFile: typeof fs.readFile,
        writeFile: typeof fs.writeFile,
        tmpFileFactory: typeof file
    ) {
        this.#formatFiles = formatFiles;
        this.#readFile = readFile;
        this.#writeFile = writeFile;
        this.#tmpFileFactory = tmpFileFactory;

        this.formatFile = this.#formatFile.bind(this);
        this.formatText = this.#formatText.bind(this);
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

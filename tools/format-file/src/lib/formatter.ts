import type fs from 'node:fs/promises';
import type { file } from 'tmp-promise';
import type {
    Executor,
    FileFormatter,
    FilesFormatter,
    TextFormatter,
    TextFormatterOptions,
} from './types.js';

/**
 * Dependency injected instance that exposes bound implementations of
 * formatters for external use.
 */
export class Formatter {
    readonly #executor: Executor;
    readonly #getBiomePath: () => string;
    readonly #readFile: typeof fs.readFile;
    readonly #writeFile: typeof fs.writeFile;
    readonly #tmpFileFactory: typeof file;
    public constructor(
        executor: Executor,
        getBiomePath: () => string,
        readFile: typeof fs.readFile,
        writeFile: typeof fs.writeFile,
        tmpFileFactory: typeof file
    ) {
        this.#executor = executor;
        this.#getBiomePath = getBiomePath;
        this.#readFile = readFile;
        this.#writeFile = writeFile;
        this.#tmpFileFactory = tmpFileFactory;
    }

    async #formatFiles(files: string[] = []): Promise<void> {
        if (files.length === 0) {
            return;
        }
        await this.#executor(this.#getBiomePath(), ['format', '--write', ...files]);
    }
    public get formatFiles(): FilesFormatter {
        return this.#formatFiles.bind(this);
    }

    async #formatFile(file: string): Promise<void> {
        return this.#formatFiles([file]);
    }
    public get formatFile(): FileFormatter {
        return this.#formatFile.bind(this);
    }

    async #formatText(text: string, options: TextFormatterOptions = {}): Promise<string> {
        const tmpFile = await this.#tmpFileFactory({
            prefix: 'format-file',
            postfix: options.ext ?? '.js',
        });

        await this.#writeFile(tmpFile.path, text, 'utf8');
        await this.#formatFiles([tmpFile.path]);
        const formatted = await this.#readFile(tmpFile.path, 'utf8');

        await tmpFile.cleanup();

        return formatted;
    }
    public get formatText(): TextFormatter {
        return this.#formatText.bind(this);
    }
}

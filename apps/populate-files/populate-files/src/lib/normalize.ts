import type { TextFormatter } from 'format-file';
import type { ParseCwd } from 'parse-cwd';
import type {
    FileContent,
    NormalizedFileParams,
    NormalizedFilesParams,
    PopulateFileParams,
    RawOptions,
} from './lib/types.js';
import Path from 'node:path';
import { stringToUint8Array } from 'uint8array-extras';

/**
 * Container class for normalizing and standardizing user input
 */
export class Normalize {
    readonly #isCi: boolean;
    readonly #parseCwd: ParseCwd;
    readonly #textFormatter: TextFormatter;

    public constructor(isCi: boolean, parseCwd: ParseCwd, textFormatter: TextFormatter) {
        this.#isCi = isCi;
        this.#parseCwd = parseCwd;
        this.#textFormatter = textFormatter;
    }

    public async normalizeFileParams(
        params: PopulateFileParams,
        options: RawOptions = {}
    ): Promise<NormalizedFileParams> {
        const [cwd, loadedContent] = await Promise.all([
            this.#parseCwd(options.cwd),
            params.content,
        ]);

        return {
            filePath: Path.resolve(cwd, params.filePath),
            content: await this.#parseContent(loadedContent),
            check: this.#normalizeCheck(options.check),
            dryRun: Normalize.#normalizeDryRun(options.dryRun),
        };
    }

    public async normalizeFilesParams(
        params: PopulateFileParams[],
        options: RawOptions = {}
    ): Promise<NormalizedFilesParams> {
        const loadedContentsPromise = Promise.all(
            params.map(async param => ({
                filePath: param.filePath,
                content: await param.content,
            }))
        );

        const [cwd, loadedContents] = await Promise.all([
            this.#parseCwd(options.cwd),
            loadedContentsPromise,
        ]);

        const files = await Promise.all(
            loadedContents.map(async loadedContent => ({
                filePath: Path.resolve(cwd, loadedContent.filePath),
                content: await this.#parseContent(loadedContent.content),
            }))
        );

        return {
            files,
            check: this.#normalizeCheck(options.check),
            dryRun: Normalize.#normalizeDryRun(options.dryRun),
        };
    }

    async #parseContent(content: FileContent): Promise<Uint8Array> {
        if (content instanceof Uint8Array) {
            return content;
        }
        const str =
            typeof content === 'string'
                ? content
                : await this.#textFormatter(JSON.stringify(content), { ext: '.json' });

        return stringToUint8Array(str);
    }

    #normalizeCheck(check?: boolean | null): boolean {
        return check ?? this.#isCi;
    }
    static #normalizeDryRun(dryRun?: boolean | null): boolean {
        return dryRun ?? false;
    }
}

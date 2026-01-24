import type { mkdir as Mkdir, writeFile as WriteFile } from 'node:fs/promises';
import type {
    NormalizedFileParams,
    PopulationResponse,
    PopulationResponseUpdateReason,
} from './lib/types.js';
import type { SafeLoadFile } from './loader.js';
import Path from 'node:path';
import { areUint8ArraysEqual } from 'uint8array-extras';
import { formatErrorMessage } from './lib/errors.js';

export type InternalPopulateFile = ({
    filePath,
    content,
    check,
    dryRun,
}: NormalizedFileParams) => Promise<PopulationResponse>;

/**
 * Container for internal file population logic
 */
export class PopulateFile {
    readonly #safeLoadFile: SafeLoadFile;
    readonly #mkdir: typeof Mkdir;
    readonly #writeFile: typeof WriteFile;

    public readonly internalPopulateFile: InternalPopulateFile;

    public constructor(
        safeLoadFile: SafeLoadFile,
        mkdir: typeof Mkdir,
        writeFile: typeof WriteFile
    ) {
        this.#safeLoadFile = safeLoadFile;
        this.#mkdir = mkdir;
        this.#writeFile = writeFile;

        this.internalPopulateFile = this.#internalPopulateFile.bind(this);
    }

    async #internalPopulateFile({
        filePath,
        content,
        check,
        dryRun,
    }: NormalizedFileParams): Promise<PopulationResponse> {
        const rawFile = await this.#safeLoadFile(filePath);

        let reason: PopulationResponseUpdateReason;

        if (rawFile === null) {
            reason = 'file-not-exist';
            if (check) {
                throw new Error(formatErrorMessage({ filePath, reason }));
            }

            await this.#createPathAndWrite({ filePath, content, dryRun });
            return { filePath, reason, updated: true };
        }

        if (areUint8ArraysEqual(rawFile, content)) {
            return { filePath, updated: false };
        }

        reason = 'content-changed';

        if (check) {
            throw new Error(formatErrorMessage({ filePath, reason }));
        }
        await this.#createPathAndWrite({ filePath, content, dryRun });

        return { filePath, reason, updated: true };
    }

    async #createPathAndWrite({
        filePath,
        content,
        dryRun,
    }: {
        filePath: string;
        content: Uint8Array;
        dryRun: boolean;
    }): Promise<void> {
        if (dryRun) {
            return;
        }

        await this.#mkdir(Path.dirname(filePath), {
            recursive: true,
        });

        await this.#writeFile(filePath, content);
    }
}

import type {
    FileContent,
    NormalizedFileParams,
    NormalizedFilesParams,
    PopulateFileParams,
    RawOptions,
} from './lib/types.js';
import Path from 'node:path';
import { isCI } from 'ci-info';
import { stringToUint8Array } from 'uint8array-extras';
import { formatText } from 'format-file';
import { parseCwd } from 'parse-cwd';

const parseContent = async (content: FileContent): Promise<Uint8Array> => {
    if (content instanceof Uint8Array) {
        return content;
    }
    const str =
        typeof content === 'string'
            ? content
            : await formatText(JSON.stringify(content), { ext: '.json' });

    return stringToUint8Array(str);
};

const normalizeCheck = (check?: boolean | null): boolean => check ?? isCI;
const normalizeDryRun = (dryRun?: boolean | null): boolean => dryRun ?? false;

/**
 * Normalize and standardize user input for populating a single file.
 *
 * @param params - file path and (possibly async) content
 * @param options - raw user options
 * @returns resolved file path, content bytes, and flags
 */
export const normalizeFileParams = async (
    params: PopulateFileParams,
    options: RawOptions = {}
): Promise<NormalizedFileParams> => {
    const [cwd, loadedContent] = await Promise.all([parseCwd(options.cwd), params.content]);
    const targetDir = Path.resolve(cwd, options.targetDir ?? '.');
    return {
        filePath: Path.resolve(targetDir, params.filePath),
        content: await parseContent(loadedContent),
        check: normalizeCheck(options.check),
        dryRun: normalizeDryRun(options.dryRun),
    };
};

/**
 * Normalize and standardize user input for populating multiple files.
 *
 * @param params - list of file paths and (possibly async) contents
 * @param options - raw user options
 * @returns resolved file paths, content bytes, target dir, and flags
 */
export const normalizeFilesParams = async (
    params: PopulateFileParams[],
    options: RawOptions = {}
): Promise<NormalizedFilesParams> => {
    const loadedContentsPromise = Promise.all(
        params.map(async param => ({
            filePath: param.filePath,
            content: await param.content,
        }))
    );

    const [cwd, loadedContents] = await Promise.all([parseCwd(options.cwd), loadedContentsPromise]);
    const targetDir = Path.resolve(cwd, options.targetDir ?? '.');

    const files = await Promise.all(
        loadedContents.map(async loadedContent => ({
            filePath: Path.resolve(targetDir, loadedContent.filePath),
            content: await parseContent(loadedContent.content),
        }))
    );

    return {
        files,
        targetDir,
        check: normalizeCheck(options.check),
        dryRun: normalizeDryRun(options.dryRun),
        clean: options.clean ?? false,
    };
};

import type {
    FileContent,
    NormalizedFileParams,
    NormalizedFilesParams,
    NormalizedParams,
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

/**
 * Load and parse a file's content. Signed content stays a string, since it is merged with the
 * existing file and signed before writing.
 *
 * @param params - raw file params
 * @param targetDirPromise - directory relative file paths resolve from
 * @returns normalized file params
 */
const normalizeParams = async (
    params: PopulateFileParams,
    targetDirPromise: Promise<string>
): Promise<NormalizedParams> => {
    const [targetDir, content] = await Promise.all([targetDirPromise, params.content]);
    const filePath = Path.resolve(targetDir, params.filePath);
    if (params.signed === true) {
        if (typeof content !== 'string') {
            throw new TypeError(`Signed content must be a string: ${filePath}`);
        }
        return { filePath, content, signed: true };
    }
    return { filePath, content: await parseContent(content), signed: false };
};

const resolveTargetDir = async (options: RawOptions): Promise<string> =>
    Path.resolve(await parseCwd(options.cwd), options.targetDir ?? '.');

const shouldCheck = (check?: boolean | null): boolean => check ?? isCI;
const isDryRun = (dryRun?: boolean | null): boolean => dryRun === true;

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
): Promise<NormalizedFileParams> => ({
    ...(await normalizeParams(params, resolveTargetDir(options))),
    check: shouldCheck(options.check),
    dryRun: isDryRun(options.dryRun),
    force: options.force ?? false,
});

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
    const targetDirPromise = resolveTargetDir(options);
    const [targetDir, files] = await Promise.all([
        targetDirPromise,
        Promise.all(params.map(async param => normalizeParams(param, targetDirPromise))),
    ]);

    return {
        files,
        targetDir,
        check: shouldCheck(options.check),
        dryRun: isDryRun(options.dryRun),
        force: options.force ?? false,
        clean: options.clean ?? false,
    };
};

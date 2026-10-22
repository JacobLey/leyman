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
 * @rejects {TypeError} if signed content isn't a string
 */
const normalizeParams = async (
    params: PopulateFileParams,
    targetDirPromise: Promise<string>
): Promise<NormalizedParams> => {
    const [targetDir, content] = await Promise.all([targetDirPromise, params.content]);
    const filePath = Path.resolve(targetDir, params.filePath);
    const inputs = params.manifestInputs ? { inputs: params.manifestInputs } : {};
    if (params.signed === true) {
        if (typeof content !== 'string') {
            throw new TypeError(`Signed content must be a string: ${filePath}`);
        }
        return { filePath, content, signed: true, ...inputs };
    }
    return { filePath, content: await parseContent(content), signed: false, ...inputs };
};

const resolveTargetDir = async (options: RawOptions): Promise<string> =>
    Path.resolve(await parseCwd(options.cwd), options.targetDir ?? '.');

// Relative to `cwd`, like `targetDir`, so it can sit outside the target directory.
const resolveManifestPath = async (options: RawOptions): Promise<string | null> =>
    options.manifest ? Path.resolve(await parseCwd(options.cwd), options.manifest) : null;

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
): Promise<NormalizedFileParams> => {
    const [normalized, manifestPath] = await Promise.all([
        normalizeParams(params, resolveTargetDir(options)),
        resolveManifestPath(options),
    ]);
    return {
        ...normalized,
        check: shouldCheck(options.check),
        dryRun: isDryRun(options.dryRun),
        force: options.force ?? false,
        manifestPath,
    };
};

/**
 * Normalize and standardize user input for populating multiple files.
 *
 * @param params - list of file paths and (possibly async) contents
 * @param options - raw user options
 * @returns resolved file paths, content bytes, target dir, and flags
 * @rejects {TypeError} if signed content isn't a string, or a file is populated more than once
 */
export const normalizeFilesParams = async (
    params: PopulateFileParams[],
    options: RawOptions = {}
): Promise<NormalizedFilesParams> => {
    const targetDirPromise = resolveTargetDir(options);
    const [targetDir, files, manifestPath] = await Promise.all([
        targetDirPromise,
        Promise.all(params.map(async param => normalizeParams(param, targetDirPromise))),
        resolveManifestPath(options),
    ]);

    // Written in parallel, so the same path twice would race
    const filePaths = new Set<string>();
    for (const { filePath } of files) {
        if (filePaths.has(filePath)) {
            throw new TypeError(`File is populated more than once: ${filePath}`);
        }
        filePaths.add(filePath);
    }

    return {
        files,
        targetDir,
        manifestPath,
        check: shouldCheck(options.check),
        dryRun: isDryRun(options.dryRun),
        force: options.force ?? false,
        clean: options.clean ?? false,
    };
};

import Path from 'node:path';
import { isCI } from 'ci-info';
import { parseCwd } from 'npm-parse-cwd';
import { stringToUint8Array } from 'uint8array-extras';
import { formatText } from 'format-file';
import type {
    FileContent,
    NormalizedFileParams,
    NormalizedFilesParams,
    PopulateFileParams,
    RawOptions,
} from './types.js';

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

const normalizeCheck = (check?: boolean): boolean => check ?? isCI;
const normalizeDryRun = (dryRun?: boolean): boolean => dryRun ?? false;

export const normalizeFileParams = async (
    params: PopulateFileParams,
    options: RawOptions = {}
): Promise<NormalizedFileParams> => {
    const [cwd, loadedContent] = await Promise.all([parseCwd(options.cwd), params.content]);

    return {
        filePath: Path.resolve(cwd, params.filePath),
        content: await parseContent(loadedContent),
        check: normalizeCheck(options.check),
        dryRun: normalizeDryRun(options.dryRun),
    };
};

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

    const files = await Promise.all(
        loadedContents.map(async loadedContent => ({
            filePath: Path.resolve(cwd, loadedContent.filePath),
            content: await parseContent(loadedContent.content),
        }))
    );

    return {
        files,
        check: normalizeCheck(options.check),
        dryRun: normalizeDryRun(options.dryRun),
    };
};

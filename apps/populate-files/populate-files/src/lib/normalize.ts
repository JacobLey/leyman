import { resolve } from 'node:path';
import { isCI } from 'ci-info';
import { parseCwd } from 'npm-parse-cwd';
import type { FileContent, NormalizedFileParams, NormalizedFilesParams, PopulateFileParams, RawOptions } from './types.js';

const parseContent = (content: FileContent): Buffer => {
    if (Buffer.isBuffer(content)) {
        return content;
    }
    const str = content instanceof String ?
        content :
        `${JSON.stringify(content, null, 2)}\n`;

    return Buffer.from(str, 'utf8');
};

const normalizeCheck = (check?: boolean) => check || isCI;
const normalizeDryRun = (dryRun?: boolean) => dryRun || false;

export const normalizeFileParams = async (
    params: PopulateFileParams,
    options: RawOptions = {},
): Promise<NormalizedFileParams> => {

    const [
        cwd,
        loadedContent,
    ] = await Promise.all([
        parseCwd(options.cwd),
        params.content
    ]);

    return {
        filePath: resolve(cwd, params.filePath),
        content: parseContent(loadedContent),
        check: normalizeCheck(options.check),
        dryRun: normalizeDryRun(options.dryRun),
    };
}

export const normalizeFilesParams = async (
    params: PopulateFileParams[],
    options: RawOptions = {},
): Promise<NormalizedFilesParams> => {

    const loadedContentsPromise = Promise.all(
        params.map(async param => ({
            filePath: param.filePath,
            content: await param.content,
        }))
    );

    const [
        cwd,
        loadedContents
    ] = await Promise.all([
        parseCwd(options.cwd),
        loadedContentsPromise,
    ]);

    return {
        files: loadedContents.map(loadedContent => ({
            filePath: resolve(cwd, loadedContent.filePath),
            content: parseContent(loadedContent.content),
        })),
        check: normalizeCheck(options.check),
        dryRun: normalizeDryRun(options.dryRun),
    };
};

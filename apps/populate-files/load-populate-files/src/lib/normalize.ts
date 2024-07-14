import Path from 'node:path';
import { parseCwd } from 'npm-parse-cwd';
import type { NormalizedParams, RawOptions, RawParams } from './types.js';

export const normalizeParams = async (
    params: RawParams,
    options: RawOptions = {}
): Promise<NormalizedParams> => {
    const cwd = await parseCwd(options.cwd);

    return {
        filePath: Path.resolve(cwd, params.filePath),
        options: {
            cwd,
            check: options.check,
            dryRun: options.dryRun,
        },
    };
};

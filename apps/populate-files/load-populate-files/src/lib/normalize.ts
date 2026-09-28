import type { NormalizedParams, RawOptions, RawParams } from './types.js';
import Path from 'node:path';
import { parseCwd } from 'parse-cwd';

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
            targetDir: options.targetDir,
            clean: options.clean,
        },
    };
};

import type { ParseCwd } from 'parse-cwd';
import type { NormalizedParams, RawOptions, RawParams } from './types.js';
import Path from 'node:path';

export type NormalizeParams = (
    params: RawParams,
    options?: RawOptions
) => Promise<NormalizedParams>;

export const normalizeParamsProvider =
    (parseCwd: ParseCwd): NormalizeParams =>
    async (params, options = {}) => {
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

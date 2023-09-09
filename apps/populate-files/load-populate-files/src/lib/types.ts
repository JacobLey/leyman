import type { Directory } from 'npm-parse-cwd';

export interface RawParams {
    filePath: string;
}

export interface RawOptions {
    cwd?: Directory;
    check?: boolean | undefined;
    dryRun?: boolean | undefined;
}

export interface NormalizedParams {
    filePath: string;
    options: {
        cwd: string;
        check?: boolean | undefined;
        dryRun?: boolean | undefined;
    };
}

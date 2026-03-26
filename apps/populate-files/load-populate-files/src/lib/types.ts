import type { Directory } from 'parse-cwd';

export interface RawParams {
    filePath: string;
}

export interface RawOptions {
    cwd?: Directory;
    targetDir?: string | null | undefined;
    check?: boolean | null | undefined;
    dryRun?: boolean | null | undefined;
    clean?: boolean | null | undefined;
}

export interface NormalizedParams {
    filePath: string;
    options: {
        cwd: string;
        targetDir?: string | null | undefined;
        check?: boolean | null | undefined;
        dryRun?: boolean | null | undefined;
        clean?: boolean | null | undefined;
    };
}

import type { Directory } from 'npm-parse-cwd';

export type FileContent = Buffer | string | object;

export interface PopulateFileParams {
    filePath: string;
    content: FileContent | Promise<FileContent>;
}
export interface NormalizedParams {
    filePath: string;
    content: Buffer;
}

export interface RawOptions {
    check?: boolean | undefined;
    dryRun?: boolean | undefined;
    cwd?: Directory | undefined;
}
export interface NormalizedOptions {
    check: boolean;
    dryRun: boolean;
}

export interface NormalizedFileParams
    extends NormalizedOptions,
        NormalizedParams {}
export interface NormalizedFilesParams extends NormalizedOptions {
    files: NormalizedParams[];
}

export type PopulationResponseUpdateReason =
    | 'file-not-exist'
    | 'content-changed';
export interface AbstractPopulationResponse {
    filePath: string;
}
export interface PopulationResponseUpdated extends AbstractPopulationResponse {
    updated: true;
    reason: PopulationResponseUpdateReason;
}
export interface PopulationResponseUnchanged
    extends AbstractPopulationResponse {
    updated: false;
}
export type PopulationResponse =
    | PopulationResponseUnchanged
    | PopulationResponseUpdated;

import type { Directory } from 'npm-parse-cwd';

export type FileContent = object | string | Uint8Array;

export interface PopulateFileParams {
    filePath: string;
    content: FileContent | Promise<FileContent>;
}
export interface NormalizedParams {
    filePath: string;
    content: Uint8Array;
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
    | 'content-changed'
    | 'file-not-exist';
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

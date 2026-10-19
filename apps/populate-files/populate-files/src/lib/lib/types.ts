import type { Directory } from 'parse-cwd';

export type FileContent = object | string | Uint8Array;

export interface UnsignedPopulateFileParams {
    filePath: string;
    content: FileContent | Promise<FileContent>;
    signed?: false;
}
/**
 * Signed with `generated-signature`, so only text content is allowed.
 */
export interface SignedPopulateFileParams {
    filePath: string;
    content: string | Promise<string>;
    signed: true;
}
export type PopulateFileParams = SignedPopulateFileParams | UnsignedPopulateFileParams;

export type NormalizedParams =
    | {
          filePath: string;
          content: string;
          signed: true;
      }
    | {
          filePath: string;
          content: Uint8Array;
          signed: false;
      };

export interface RawOptions {
    check?: boolean | null | undefined;
    dryRun?: boolean | null | undefined;
    cwd?: Directory | null | undefined;
    targetDir?: string | null | undefined;
    clean?: boolean | null | undefined;
    force?: boolean | null | undefined;
}
export interface NormalizedOptions {
    check: boolean;
    dryRun: boolean;
    force: boolean;
}

export type NormalizedFileParams = NormalizedOptions & NormalizedParams;
export interface NormalizedFilesParams extends NormalizedOptions {
    files: NormalizedParams[];
    clean: boolean;
    targetDir: string;
}

export type PopulationResponseUpdateReason = 'content-changed' | 'file-not-exist' | 'stale-file';
/**
 * Why a signed file was not overwritten.
 */
export type OwnershipReason = 'edited' | 'malformed' | 'not-owned' | 'orphaned-section';
export interface AbstractPopulationResponse {
    filePath: string;
}
export interface PopulationResponseUpdated extends AbstractPopulationResponse {
    updated: true;
    reason: PopulationResponseUpdateReason;
}
export interface PopulationResponseUnchanged extends AbstractPopulationResponse {
    updated: false;
}
export type PopulationResponse = PopulationResponseUnchanged | PopulationResponseUpdated;

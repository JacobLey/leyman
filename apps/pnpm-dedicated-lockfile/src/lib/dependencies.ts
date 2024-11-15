import { findWorkspaceDir } from '@pnpm/find-workspace-dir';
import { type Lockfile, readWantedLockfile } from '@pnpm/lockfile.fs';
import { bind, createModule, identifier } from 'npm-haywire';
import { type Directory, parseCwd } from 'npm-parse-cwd';
import { populateFile, type PopulateFile } from 'npm-populate-files';

export type ConsoleLog = (log: unknown) => void;
export const consoleLogId = identifier<ConsoleLog>().named('log');
export const consoleErrorId = identifier<ConsoleLog>().named('error');

export type ExitCode = (code: number) => void;
export const exitCodeId = identifier<ExitCode>();

export type FindLockfileDir = (dir: string) => Promise<string | undefined>;
export const findLockfileDirId = identifier<FindLockfileDir>();

export type ReadLockfile = (
    dir: string,
    opts: { ignoreIncompatible: boolean }
) => Promise<Lockfile | null>;
export const readLockfileId = identifier<ReadLockfile>();

export type ParseCwd = (dir?: Directory) => Promise<string>;
export const parseCwdId = identifier<ParseCwd>();

export const populateFileId = identifier<PopulateFile>();

export const dependenciesModule = createModule(
    bind(consoleLogId).withInstance(
        // eslint-disable-next-line no-console
        console.log
    )
)
    .addBinding(
        bind(consoleErrorId).withInstance(
            // eslint-disable-next-line no-console
            console.error
        )
    )
    .addBinding(
        bind(exitCodeId).withInstance(code => {
            process.exitCode = code;
        })
    )
    .addBinding(bind(findLockfileDirId).withInstance(findWorkspaceDir))
    .addBinding(bind(readLockfileId).withInstance(readWantedLockfile))
    .addBinding(bind(parseCwdId).withInstance(parseCwd))
    .addBinding(bind(populateFileId).withInstance(populateFile));

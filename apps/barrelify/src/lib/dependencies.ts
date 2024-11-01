import { readFile, writeFile } from 'node:fs/promises';
import { globby, type Options as GlobbyOptions } from 'globby';
import { findImport } from 'find-import';
import { bind, createModule, identifier } from 'haywire';
import { type Directory, parseCwd } from 'parse-cwd';

export type ConsoleLog = (log: unknown) => void;
export const consoleLogId = identifier<ConsoleLog>().named('log');
export const consoleErrorId = identifier<ConsoleLog>().named('error');

export type ReadFile = typeof readFile;
export const readFileId = identifier<ReadFile>();
export type WriteFile = typeof writeFile;
export const writeFileId = identifier<WriteFile>();

export type ExitCode = (code: number) => void;
export const exitCodeId = identifier<ExitCode>();

export type FindImport = (
    path: string,
    options?: { cwd?: Directory }
) => Promise<{ content: unknown } | null>;
export const findImportId = identifier<FindImport>();

export type Globby = (patterns: string[], options?: GlobbyOptions) => Promise<string[]>;
export const globbyId = identifier<Globby>();

export type ParseCwd = (dir?: Directory) => Promise<string>;
export const parseCwdId = identifier<ParseCwd>();

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
    .addBinding(bind(readFileId).withInstance(readFile))
    .addBinding(bind(writeFileId).withInstance(writeFile))
    .addBinding(bind(findImportId).withInstance(findImport))
    .addBinding(bind(globbyId).withInstance(globby))
    .addBinding(bind(parseCwdId).withInstance(parseCwd));
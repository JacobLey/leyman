import { readFile } from 'node:fs/promises';
import { workspaceRoot } from '@nx/devkit';
import { isCI } from 'ci-info';
import { bind, createModule, identifier } from 'haywire';
import { type ParseCwd, parseCwd } from 'parse-cwd';
import { populateFile, type PopulateFile } from 'populate-files';

export interface Logger {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export const readFileId = identifier<typeof readFile>();
export const isCiId = identifier<boolean>().named('isCI');
export const workspaceRootId = identifier<string>().named('root');
export const parseCwdId = identifier<ParseCwd>();
export const populateFileId = identifier<PopulateFile>();

export const dependenciesModule = createModule(bind(readFileId).withInstance(readFile))
    .addBinding(bind(workspaceRootId).withInstance(workspaceRoot))
    .addBinding(bind(isCiId).withInstance(isCI))
    .addBinding(bind(parseCwdId).withInstance(parseCwd))
    .addBinding(bind(populateFileId).withInstance(populateFile));

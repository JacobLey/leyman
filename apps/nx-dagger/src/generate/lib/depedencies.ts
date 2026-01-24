import type { ParseCwd } from 'parse-cwd';
import type { PopulateFiles } from 'populate-files';
import { readFile } from 'node:fs/promises';
import { workspaceRoot } from '@nx/devkit';
import { isCI } from 'ci-info';
import { bind, createModule, identifier } from 'haywire';
import { parseCwd } from 'parse-cwd';
import { populateFiles } from 'populate-files';

export interface Logger {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export const readFileId = identifier<typeof readFile>();
export const isCiId = identifier<boolean>().named('isCI');
export const workspaceRootId = identifier<string>().named('root');
export const parseCwdId = identifier<ParseCwd>();
export const populateFilesId = identifier<PopulateFiles>();

export const dependenciesModule = createModule(bind(readFileId).withInstance(readFile))
    .addBinding(bind(workspaceRootId).withInstance(workspaceRoot))
    .addBinding(bind(isCiId).withInstance(isCI))
    .addBinding(bind(parseCwdId).withInstance(parseCwd))
    .addBinding(bind(populateFilesId).withInstance(populateFiles));

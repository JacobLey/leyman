import type { ParseCwd } from 'parse-cwd';
import type { PopulateFiles } from 'populate-files';
import { bind, createModule, identifier } from 'haywire';
import { parseCwd } from 'parse-cwd';
import { populateFiles } from 'populate-files';

export type Importer = (specifier: string) => Promise<unknown>;
export const importerId = identifier<Importer>();

export const parseCwdId = identifier<ParseCwd>();

export const populateFilesId = identifier<PopulateFiles>();

export const dependencies = createModule(
    bind(importerId).withInstance(async specifier => import(specifier))
)
    .addBinding(bind(parseCwdId).withInstance(parseCwd))
    .addBinding(bind(populateFilesId).withInstance(populateFiles));

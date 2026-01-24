import type { FilesFormatter } from 'format-file';
import type { ParseCwd } from 'parse-cwd';
import { readFile, writeFile } from 'node:fs/promises';
import { isCI } from 'ci-info';
import { formatFiles } from 'format-file';
import { bind, createModule, identifier } from 'haywire';
import { parseCwd } from 'parse-cwd';

export interface Logger {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export const readFileIdentifier = identifier<typeof readFile>();
export const writeFileIdentifier = identifier<typeof writeFile>();
export const formatFileIdentifier = identifier<FilesFormatter>();
export const isCiIdentifier = identifier<boolean>().named('isCI');
export const loggerIdentifier = identifier<Logger>();
export const parseCwdId = identifier<ParseCwd>();

export const dependenciesModule = createModule(bind(readFileIdentifier).withInstance(readFile))
    .addBinding(bind(writeFileIdentifier).withInstance(writeFile))
    .addBinding(bind(formatFileIdentifier).withInstance(formatFiles))
    .addBinding(bind(isCiIdentifier).withInstance(isCI))
    .addBinding(bind(loggerIdentifier).withInstance(console))
    .addBinding(bind(parseCwdId).withInstance(parseCwd));

import type { TextFormatter } from 'format-file';
import type { ParseCwd } from 'parse-cwd';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isCI } from 'ci-info';
import { formatText } from 'format-file';
import { bind, createModule, identifier } from 'haywire';
import { parseCwd } from 'parse-cwd';

export const ciId = identifier<boolean>().named('ci');
export const textFormatterId = identifier<TextFormatter>();
export const parseCwdId = identifier<ParseCwd>();

export const mkdirId = identifier<typeof mkdir>();
export const readFileId = identifier<typeof readFile>();
export const writeFileId = identifier<typeof writeFile>();

export const dependenciesModule = createModule(bind(ciId).withInstance(isCI))
    .addBinding(bind(textFormatterId).withInstance(formatText))
    .addBinding(bind(parseCwdId).withInstance(parseCwd))
    .addBinding(bind(mkdirId).withInstance(mkdir))
    .addBinding(bind(readFileId).withInstance(readFile))
    .addBinding(bind(writeFileId).withInstance(writeFile));

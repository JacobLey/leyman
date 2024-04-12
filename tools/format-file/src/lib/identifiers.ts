import type { readFile, writeFile } from 'node:fs/promises';
import type { file } from 'tmp-promise';
import { identifier } from 'haywire';
import type { Executor } from './types.js';

export const executorId = identifier<Executor>();
export const biomePathId = identifier<string>().named('biome-path');
export const readFileId = identifier<typeof readFile>();
export const writeFileId = identifier<typeof writeFile>();
export const tmpFileFactoryId = identifier<typeof file>();

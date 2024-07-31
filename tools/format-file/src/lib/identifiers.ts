import type { readFile, writeFile } from 'node:fs/promises';
import type { file } from 'tmp-promise';
import { identifier } from 'haywire';
import type { CanUseFormatter, Executor } from '#types';

export const executorId = identifier<Executor>();
export const biomePathId = identifier<string>().named('biome-path');
export const canUseBiomeId = identifier<CanUseFormatter>().named('can-use-biome');
export const formatBiomeId = identifier<(files: string[]) => Promise<void>>().named('format-biome');
export const prettierPathId = identifier<string>().named('prettier-path');
export const canUsePrettierId = identifier<CanUseFormatter>().named('can-use-prettier');
export const formatPrettierId = identifier<(files: string[]) => Promise<void>>().named('format-prettier');
export const readFileId = identifier<typeof readFile>();
export const writeFileId = identifier<typeof writeFile>();
export const tmpFileFactoryId = identifier<typeof file>();

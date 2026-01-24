import type { readFile, writeFile } from 'node:fs/promises';
import type { findUp } from 'find-up';
import type { resolveConfig } from 'prettier';
import type { file } from 'tmp-promise';
import type { CanUseFormatter, Executor } from '#types';
import { identifier } from 'haywire';

export const executorId = identifier<Executor>();
export const findUpId = identifier<typeof findUp>();
export const biomePathId = identifier<string>().named('biome-path');
export const canUseBiomeId = identifier<CanUseFormatter>().named('can-use-biome');
export const formatBiomeId = identifier<(files: string[]) => Promise<void>>().named('format-biome');
export const prettierPathId = identifier<string>().named('prettier-path');
export const prettierResolveConfigId = identifier<typeof resolveConfig>();
export const canUsePrettierId = identifier<CanUseFormatter>().named('can-use-prettier');
export const formatPrettierId =
    identifier<(files: string[]) => Promise<void>>().named('format-prettier');
export const readFileId = identifier<typeof readFile>();
export const writeFileId = identifier<typeof writeFile>();
export const tmpFileFactoryId = identifier<typeof file>();

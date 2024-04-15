import type fs from 'node:fs/promises';
import { identifier } from 'haywire';
import type { TsConfigSettings } from './config-loader.js';

export type OutputCleaner = (settings: TsConfigSettings) => Promise<void>;
export const outputCleanerId = identifier<OutputCleaner>();

export const outputCleanerProvider =
    (rm: typeof fs.rm): OutputCleaner =>
    async settings => {
        await rm(settings.outDir, { force: true, recursive: true });
    };

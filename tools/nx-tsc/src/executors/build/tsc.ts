import type { ExecutorContext } from '@nx/devkit';
import { identifier } from 'haywire';
import type { Compiler } from './compiler.js';
import type { ConfigLoader } from './config-loader.js';
import type { NormalizeOptions } from './normalizer.js';
import type { OutputCleaner } from './output-cleaner.js';
import type { BuildOptions } from './schema.js';

/**
 * Primary entrypoint for tsc command for Nx.
 */
type Tsc = (
    /**
     * Build options passed from project.json
     */
    options: BuildOptions,
    /**
     * Nx/project/command specific context
     */
    context: ExecutorContext
) => Promise<{ success: boolean }>;
export const tscId = identifier<Tsc>();

export const tscProvider =
    (
        normalizeOptions: NormalizeOptions,
        configLoader: ConfigLoader,
        outputCleaner: OutputCleaner,
        compiler: Compiler
    ): Tsc =>
    async (options, context) => {
        const normalized = await normalizeOptions(options, context);

        const tsConfig = configLoader(normalized);

        await outputCleaner(tsConfig.settings);

        await compiler(normalized, tsConfig);

        return { success: true };
    };

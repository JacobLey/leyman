import type { ExecutorContext } from '@nx/devkit';
import type { NxDagger } from '../../generate/nx-dagger.js';
import type { DaggerOptionsOrConfig } from '../../generate/schema.js';

export type SimpleExecutorContext = Pick<ExecutorContext, 'projectGraph'>;

/**
 * Main logic for dagger generation.
 *
 * Passes project graph + config to core component shared with CLI
 */
export class DaggerGenerate {
    readonly #nxDagger: NxDagger;

    public readonly generate: (
        options: DaggerOptionsOrConfig,
        context: SimpleExecutorContext
    ) => Promise<{ success: boolean }>;

    public constructor(nxDagger: NxDagger) {
        this.#nxDagger = nxDagger;

        this.generate = this.#generate.bind(this);
    }

    async #generate(
        options: DaggerOptionsOrConfig,
        context: SimpleExecutorContext
    ): Promise<{ success: boolean }> {
        await this.#nxDagger(context.projectGraph, options);

        return { success: true };
    }
}

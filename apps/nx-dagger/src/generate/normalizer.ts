import type { readFile as ReadFile } from 'node:fs/promises';
import Path from 'node:path';
import type { ParseCwd } from 'parse-cwd';
import { type DaggerOptions, type DaggerOptionsOrConfig, isDaggerOptions } from './schema.js';

export interface NormalizedOptions extends DaggerOptions {
    check: boolean;
    dryRun: boolean;
}

export type NormalizeOptions = (options: DaggerOptionsOrConfig) => Promise<NormalizedOptions>;

/**
 * Standardizes the options passed to this executor,
 * based on input, reasonable defaults, and project state.
 */
export class Normalizer {
    readonly #isCI: () => boolean;
    readonly #parseCwd: ParseCwd;
    readonly #readFile: typeof ReadFile;

    public readonly normalizeOptions: NormalizeOptions;

    public constructor(isCI: () => boolean, parseCwd: ParseCwd, readFile: typeof ReadFile) {
        this.#isCI = isCI;
        this.#parseCwd = parseCwd;
        this.#readFile = readFile;

        this.normalizeOptions = this.#normalizeOptions.bind(this);
    }

    async #normalizeOptions(options: DaggerOptionsOrConfig): Promise<NormalizedOptions> {
        const loadedOptions = await this.#loadOptions(options);

        return {
            check: loadedOptions.check ?? this.#isCI(),
            dryRun: loadedOptions.dryRun ?? false,
            constructorArguments: loadedOptions.constructorArguments,
            dagger: loadedOptions.dagger,
            runtimes: loadedOptions.runtimes,
            targets: loadedOptions.targets,
        };
    }

    async #loadOptions(options: DaggerOptionsOrConfig): Promise<DaggerOptions> {
        if ('targets' in options) {
            return options;
        }

        const cwd = await this.#parseCwd(options.cwd);
        const configFile = Path.join(cwd, options.configFile ?? './nx-dagger.json');

        const loadedConfig = await this.#readFile(configFile, 'utf8');
        const parsedConfig: unknown = JSON.parse(loadedConfig);

        if (isDaggerOptions(parsedConfig)) {
            return {
                ...parsedConfig,
                ...options,
            };
        }
        throw new Error(`Invalid config loaded from ${configFile}`);
    }
}

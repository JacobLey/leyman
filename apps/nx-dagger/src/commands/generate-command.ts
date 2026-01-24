import type { ProjectGraph } from '@nx/devkit';
import type { Argv } from 'yargs';
import type { NxDagger } from '../generate/nx-dagger.js';
import type { Command, NxDaggerCommandInput } from './lib/types.js';
import { isCI } from 'ci-info';

interface GenerateCommandInput extends NxDaggerCommandInput {
    configFile: string;
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `load-populate-files` command
 */
export class GenerateCommand implements Command<GenerateCommandInput> {
    public readonly command = ['$0', 'generate'];
    public readonly describe =
        'Generate main.go file for monorepo function that executes Nx targets';

    readonly #getProjectGraph: () => Promise<ProjectGraph>;
    readonly #nxDagger: NxDagger;

    public constructor(getProjectGraph: () => Promise<ProjectGraph>, nxDagger: NxDagger) {
        this.#getProjectGraph = getProjectGraph;
        this.#nxDagger = nxDagger;

        this.handler = this.handler.bind(this);
    }

    public builder(this: void, yargs: Argv<NxDaggerCommandInput>): Argv<GenerateCommandInput> {
        return yargs
            .options({
                configFile: {
                    describe: 'File that exports dagger config for nx targets',
                    type: 'string',
                    default: 'nx-dagger.json',
                },
                ci: {
                    describe: 'Fail if file is not up to date. Implies --dry-run',
                    type: 'boolean',
                    default: isCI,
                    alias: 'check',
                },
                dryRun: {
                    describe: 'Do not write file',
                    type: 'boolean',
                    default: false,
                },
            })
            .strict();
    }

    public async handler(options: GenerateCommandInput): Promise<void> {
        const projectGraph = await this.#getProjectGraph();
        await this.#nxDagger(projectGraph, {
            configFile: options.configFile,
            cwd: options.cwd,
            check: options.ci,
            dryRun: options.dryRun,
        });
    }
}

import type { ProjectGraph } from '@nx/devkit';
import { isCI } from 'ci-info';
import type { Argv } from 'yargs';
import type { ILifecycleInternal } from '../lifecycle/lifecycle-internal.js';
import type { Command, LifecycleCommandInput } from './lib/types.js';

interface LifecycleCommandExtendedInput extends LifecycleCommandInput {
    configFile: string;
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `load-populate-files` command
 */
export class LifecycleCommand implements Command<LifecycleCommandExtendedInput> {
    public readonly command = ['$0', 'lifecycle'];
    public readonly describe = 'Inject Nx targets as high level workflows';

    readonly #getProjectGraph: () => Promise<ProjectGraph>;
    readonly #workspaceRoot: string;
    readonly #lifecycleInternal: ILifecycleInternal;

    public constructor(
        getProjectGraph: () => Promise<ProjectGraph>,
        workspaceRoot: string,
        lifecycleInternal: ILifecycleInternal
    ) {
        this.#getProjectGraph = getProjectGraph;
        this.#workspaceRoot = workspaceRoot;
        this.#lifecycleInternal = lifecycleInternal;

        this.handler = this.handler.bind(this);
    }

    public builder(
        this: void,
        yargs: Argv<LifecycleCommandInput>
    ): Argv<LifecycleCommandExtendedInput> {
        return yargs
            .options({
                configFile: {
                    describe: 'File that exports data content to populate',
                    type: 'string',
                    default: 'lifecycle.json',
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

    public async handler(options: LifecycleCommandExtendedInput): Promise<void> {
        const projectGraph = await this.#getProjectGraph();
        await this.#lifecycleInternal(
            {
                configFile: options.configFile,
                cwd: options.cwd,
                check: options.ci,
                dryRun: options.dryRun,
            },
            {
                root: this.#workspaceRoot,
                projects: Object.values(projectGraph.nodes).map(node => ({
                    name: node.name,
                    root: node.data.root,
                })),
            }
        );
    }
}

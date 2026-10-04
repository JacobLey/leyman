import type { Command, LifecycleCommandInput } from './lib/types.js';
import { createProjectGraphAsync, workspaceRoot } from '@nx/devkit';
import { isCI } from 'ci-info';
import { lifecycleInternal } from '../lifecycle/lifecycle-internal.js';

interface LifecycleCommandExtendedInput extends LifecycleCommandInput {
    configFile: string;
    ci: boolean;
    dryRun: boolean;
}

/**
 * Main `nx-lifecycle` command
 */
export const lifecycleCommand: Command<LifecycleCommandExtendedInput> = {
    command: ['$0', 'lifecycle'],
    describe: 'Inject Nx targets as high level workflows',
    builder: yargs =>
        yargs
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
            .strict(),
    handler: async options => {
        const projectGraph = await createProjectGraphAsync();
        await lifecycleInternal(
            {
                configFile: options.configFile,
                cwd: options.cwd,
                check: options.ci,
                dryRun: options.dryRun,
            },
            {
                root: workspaceRoot,
                projects: Object.values(projectGraph.nodes).map(node => ({
                    name: node.name,
                    root: node.data.root,
                })),
            }
        );
    },
};

import type { LifecycleExplanation } from '../lifecycle/explain.js';
import type { LifecyclePlan } from '../lifecycle/processor.js';
import type { Command, LifecycleCommandInput } from './lib/types.js';
import Path from 'node:path';
import { createProjectGraphAsync, readJsonFile, workspaceRoot } from '@nx/devkit';
import { explainLifecycle, formatExplanation } from '../lifecycle/explain.js';
import { loadOptions } from '../lifecycle/normalizer.js';
import { planLifecycle } from '../lifecycle/processor.js';
import { planPluginOptions } from '../plugin/lifecycle-plugin.js';

interface ExplainCommandExtendedInput extends LifecycleCommandInput {
    project: string;
    stage: string | undefined;
    configFile: string;
}

interface PluginEntry {
    plugin: string;
    options?: unknown;
}

interface NxJsonPlugins {
    plugins?: (string | PluginEntry)[];
}

/**
 * The plugin's options are what Nx runs, so they win over a config file for the executor.
 * Nx has already rejected the plugin without options, when it built the project graph.
 *
 * @param options - command options
 * @param options.cwd - directory the config file is resolved from
 * @param options.configFile - config file, used when `nx.json` does not register the plugin
 * @returns lifecycle targets and bindings
 */
const loadPlan = async ({
    cwd,
    configFile,
}: Pick<ExplainCommandExtendedInput, 'configFile' | 'cwd'>): Promise<LifecyclePlan> => {
    const { plugins = [] } = readJsonFile<NxJsonPlugins>(Path.join(workspaceRoot, 'nx.json'));
    const plugin = plugins.find(
        (entry): entry is PluginEntry =>
            typeof entry !== 'string' && entry.plugin === 'nx-lifecycle/plugin'
    );
    if (plugin) {
        return planPluginOptions(
            // Validated by the plugin
            plugin.options as Parameters<typeof planPluginOptions>[0]
        );
    }

    return planLifecycle(await loadOptions({ cwd, configFile }));
};

/**
 * Prints the stages of a project in the order they run, with the targets bound to each hook.
 */
export const explainCommand: Command<ExplainCommandExtendedInput> = {
    command: 'explain <project> [stage]',
    describe: 'Print what runs, in which order, for the stages of a project',
    builder: yargs =>
        yargs
            .positional('project', {
                describe: 'Name of the Nx project',
                type: 'string',
                demandOption: true,
            })
            .positional('stage', {
                describe: 'Only explain this stage, and the stages it runs after',
                type: 'string',
            })
            .options({
                configFile: {
                    describe:
                        'Lifecycle config file, used when nx.json does not register the plugin',
                    type: 'string',
                    default: 'lifecycle.json',
                },
            })
            .strict(),
    handler: async options => {
        const graph = await createProjectGraphAsync();
        const plan = await loadPlan(options);

        let explanation: LifecycleExplanation;
        try {
            explanation = explainLifecycle({
                plan,
                graph,
                project: options.project,
                ...(options.stage === undefined ? {} : { stage: options.stage }),
            });
        } catch (err) {
            // Only a mistyped project or stage, which a stack trace would bury
            // eslint-disable-next-line no-console
            console.error((err as Error).message);
            process.exitCode = 1;
            return;
        }

        // eslint-disable-next-line no-console
        console.log(formatExplanation(explanation));
    },
};

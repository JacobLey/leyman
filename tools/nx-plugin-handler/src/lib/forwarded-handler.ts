import type { ExecutorContext } from '@nx/devkit';
import type { CreateRequire, Importer } from './dependencies.js';
import Path from 'node:path';
import { defaultImport } from 'default-import';
import { isExecutorsJson, isPackageJson } from './package-json-schema.js';

export interface PluginContext extends ExecutorContext {
    forwardedToProject?: boolean;
}

export type RawHandler<Options> = (
    options: Options,
    context: PluginContext
) => Promise<{ success: boolean }>;

export type GetForwardedHandler = <Options>(
    context: PluginContext
) => Promise<RawHandler<Options> | null>;

/**
 * Higher Order Component that wraps the real plugin executor
 * with some helpers to perform error handling and extra logging.
 */
export class ForwardedHandler {
    readonly #createRequire: CreateRequire;
    readonly #importer: Importer;

    public getForwardedHandler: GetForwardedHandler;

    public constructor(createRequire: CreateRequire, importer: Importer) {
        this.#createRequire = createRequire;
        this.#importer = importer;

        this.getForwardedHandler = this.#getForwardedHandler.bind(this);
    }

    async #getForwardedHandler<Options>(
        context: PluginContext
    ): Promise<RawHandler<Options> | null> {
        if (context.forwardedToProject) {
            // Already forwarded, so run this one
            return null;
        }
        try {
            const require = this.#createRequire(Path.join(context.cwd, 'project.json'));
            const [pluginPackageName, pluginExecutorName] = context.target!.executor!.split(':');
            const pathToPluginPackageJson = require.resolve(
                Path.join(pluginPackageName!, 'package.json')
            );
            const { default: packageJson } = (await this.#importer(pathToPluginPackageJson, {
                with: { type: 'json' },
            })) as { default: unknown };
            if (!isPackageJson(packageJson)) {
                return null;
            }
            const pathToExecutorsJson = Path.join(
                pathToPluginPackageJson,
                '..',
                packageJson.executors
            );
            const { default: executorsJson } = (await this.#importer(pathToExecutorsJson, {
                with: { type: 'json' },
            })) as { default: unknown };
            if (!isExecutorsJson(executorsJson) || !executorsJson.executors[pluginExecutorName!]) {
                return null;
            }

            const pathToExecutorImplementation = Path.join(
                pathToExecutorsJson,
                '..',
                executorsJson.executors[pluginExecutorName!]!.implementation
            );
            const loaded = (await this.#importer(pathToExecutorImplementation)) as {
                default: RawHandler<Options>;
            };

            return defaultImport(loaded);
        } catch {
            return null;
        }
    }
}

import { bind, identifier } from 'haywire';
import { lifecycleInternalId, lifecycleInternalModule } from '../lifecycle/index.js';
import { dependenciesModule, projectGraphId, workspaceRootId } from './lib/dependencies.js';
import type { AbstractCommand } from './lib/types.js';
import { LifecycleCommand } from './lifecycle-command.js';

export const commandsId = identifier<AbstractCommand[]>();

export const commandsModule = dependenciesModule
    .mergeModule(lifecycleInternalModule)
    .addBinding(
        bind(commandsId)
            .withDependencies([LifecycleCommand])
            .withProvider((...commands) => commands)
    )
    .addBinding(
        bind(LifecycleCommand)
            .withDependencies([
                projectGraphId.supplier('async'),
                workspaceRootId,
                lifecycleInternalId,
            ])
            .withConstructorProvider()
    );

import { bind, createContainer } from 'haywire';
import { assertProjectJsonIdentifier } from '#schemas';
import { pluginDependenciesModule, pluginLoggerId, readJsonFileId } from './dependencies.js';
import { LifecyclePlugin } from './lifecycle-plugin.js';
import { assertLifecyclePluginOptionsId } from './schema.js';

export const lifecyclePluginContainer = createContainer(
    pluginDependenciesModule.addBinding(
        bind(LifecyclePlugin)
            .withDependencies([
                assertLifecyclePluginOptionsId,
                readJsonFileId,
                assertProjectJsonIdentifier,
                pluginLoggerId,
            ])
            .withConstructorProvider()
    )
);

import { logger, readJsonFile } from '@nx/devkit';
import { bind, createModule, identifier } from 'haywire';
import { assertProjectJson, assertProjectJsonIdentifier } from '#schemas';
import { assertLifecyclePluginOptions, assertLifecyclePluginOptionsId } from './schema.js';

export interface PluginLogger {
    warn: (message: string) => void;
}
export const pluginLoggerId = identifier<PluginLogger>();

export type ReadJsonFile = (path: string) => unknown;
export const readJsonFileId = identifier<ReadJsonFile>();

export const pluginDependenciesModule = createModule(bind(pluginLoggerId).withInstance(logger))
    .addBinding(bind(readJsonFileId).withInstance(readJsonFile))
    .addBinding(bind(assertProjectJsonIdentifier).withInstance(assertProjectJson))
    .addBinding(bind(assertLifecyclePluginOptionsId).withInstance(assertLifecyclePluginOptions));

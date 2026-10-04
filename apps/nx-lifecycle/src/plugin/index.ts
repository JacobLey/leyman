import { lifecyclePluginContainer } from './container.js';
import { LifecyclePlugin } from './lifecycle-plugin.js';

export type { LifecyclePluginOptions } from './schema.js';

/**
 * Plugin name, as Nx can't attach one to an ES module.
 */
export const name = 'nx-lifecycle';

export const { createNodes, createDependencies } = lifecyclePluginContainer.get(LifecyclePlugin);

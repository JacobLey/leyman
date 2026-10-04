export type { LifecyclePluginOptions } from './schema.js';

/**
 * Plugin name, as Nx can't attach one to an ES module.
 */
export const name = 'nx-lifecycle';

export { createDependencies, createNodes } from './lifecycle-plugin.js';

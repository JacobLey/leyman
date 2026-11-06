export type { InferencePackageJson, ProjectFacts } from './lib/infer.js';
export { inferencePaths, inferTargets } from './lib/infer.js';
export type {
    Input,
    NamedInputName,
    NxPluginOptions,
    ResolvedOptions,
    TargetName,
    TargetOptions,
} from './lib/options.js';
export { namedInputNames, resolveOptions, targetNames } from './lib/options.js';
export { namedInputs, targetConfigurations } from './lib/targets.js';
export type { WorkspaceProject } from './lib/sync.js';
export { syncTargets } from './lib/sync.js';
export {
    assertOptions,
    executorJsonSchema,
    initGeneratorJsonSchema,
    optionsJsonSchema,
    packageGeneratorJsonSchema,
} from './lib/schema.js';
export { createNodes, name } from './lib/plugin.js';
export type { LoadedProject, WorkspacePackageJson } from './lib/projects.js';
export { loadProjects } from './lib/projects.js';
export type { InitGeneratorOptions } from './generators/init.js';
export {
    default as initGenerator,
    lifecycleBindings,
    lifecycleStages,
} from './generators/init.js';
export type { PackageGeneratorOptions } from './generators/package.js';
export { default as packageGenerator } from './generators/package.js';
export type { WorkspaceVersions } from './lib/versions.js';
export { readWorkspaceVersions, resolveVersion } from './lib/versions.js';

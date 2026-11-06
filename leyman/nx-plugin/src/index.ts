export type { InferencePackageJson, ProjectFacts } from './lib/infer.js';
export { inferTargets } from './lib/infer.js';
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

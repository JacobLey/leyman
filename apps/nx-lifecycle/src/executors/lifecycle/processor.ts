import { identifier } from 'haywire';
import {
    type AllTargets,
    type DependsOn,
    isEmpty,
    type NxJson,
    type ProjectJson,
    type Target,
} from '#schemas';
import { NOOP_EXECUTOR } from './constants.js';
import type { NormalizedOptions } from './normalizer.js';

type ProcessorOptions = Pick<NormalizedOptions, 'stages' | 'targets'>;

type LifecycleTarget = {
    name: string;
    dependsOn: DependsOn;
} & (
    | {
          kind: 'anchor';
      }
    | ({
          previousHook: string;
      } & (
          | {
                  kind: 'base';
                  hasHooks: boolean;
              }
          | {
                  kind: 'hook';
              }
      ))
);

type LifecycleTargets = Map<string, LifecycleTarget>;

type LifecycleTargetWithHooks = Extract<LifecycleTarget, { previousHook: string }>;
type RegisteredTargets = Map<string, LifecycleTargetWithHooks>;

const calculateTargets = ({ stages }: ProcessorOptions): LifecycleTargets => {
    const lifecycleTargets: LifecycleTargets = new Map();

    for (const [stageName, stage] of Object.entries(stages)) {
        const prefixHook = `${stageName}:_`;
        lifecycleTargets.set(prefixHook, {
            name: prefixHook,
            kind: 'anchor',
            dependsOn: stage.dependsOn ?? [],
        });

        let previousHook = prefixHook;

        const hooks = stage.hooks ?? [];

        for (const hook of hooks) {
            const hookName = `${stageName}:${hook}`;
            lifecycleTargets.set(hookName, {
                name: hookName,
                kind: 'hook',
                dependsOn: [previousHook],
                previousHook,
            });
            previousHook = hookName;
        }
        lifecycleTargets.set(stageName, {
            name: stageName,
            kind: 'base',
            dependsOn: [previousHook],
            previousHook,
            hasHooks: hooks.length > 0,
        });
    }

    return lifecycleTargets;
};

const registerTargets = ({
    lifecycleTargets,
    options,
}: {
    lifecycleTargets: LifecycleTargets;
    options: ProcessorOptions;
}): RegisteredTargets => {
    const registeredTargets: RegisteredTargets = new Map();
    for (const [targetName, hookName] of Object.entries(options.targets)) {
        if (lifecycleTargets.has(targetName)) {
            throw new Error(`Overlap in lifecycle hook and target: ${targetName}`);
        }
        const hook = lifecycleTargets.get(hookName);
        if (!hook) {
            throw new Error(`Hook for target ${targetName} not found: ${hookName}`);
        }
        if (hook.kind === 'anchor') {
            throw new Error(`Target ${targetName} cannot be part of anchor hook ${hook.name}`);
        }
        if (hook.kind === 'base' && hook.hasHooks) {
            throw new Error(
                `Target ${targetName} cannot be part of base hook ${hook.name}. Use format ${hook.name}:<hook>`
            );
        }
        registeredTargets.set(targetName, hook);
    }

    return registeredTargets;
};

const calculateTargetsToRemove = ({
    lifecycleTargets,
    nxJson,
}: {
    lifecycleTargets: LifecycleTargets;
    nxJson: NxJson;
}): Set<string> => {
    const targetsToRemove = new Set<string>();

    for (const [targetName, target] of lifecycleTargets.entries()) {
        if (target.kind !== 'base') {
            targetsToRemove.add(targetName);
        }
    }

    for (const [targetName, target] of Object.entries(nxJson.targetDefaults ?? {})) {
        if (!lifecycleTargets.has(targetName) && '__lifecycle' in (target.configurations ?? {})) {
            targetsToRemove.add(targetName);
        }
    }

    return targetsToRemove;
};

const removeDependencyTargets = ({
    target,
    lifecycleTargets,
    targetsToRemove,
}: {
    target: Target;
    lifecycleTargets: LifecycleTargets;
    targetsToRemove: Set<string>;
}): DependsOn => {
    if (target.dependsOn) {
        return target.dependsOn.filter(dependency => {
            const dependencyTarget =
                typeof dependency === 'string' ? dependency : dependency.target;

            const normalized = dependencyTarget.replace(/^\^/u, '');
            if (targetsToRemove.has(normalized)) {
                return false;
            }
            const lifecycleTarget = lifecycleTargets.get(normalized);
            if (lifecycleTarget) {
                return lifecycleTarget.kind === 'base';
            }
            return true;
        });
    }
    return [];
};

const validateLifecycleDependencies = ({
    lifecycleTargets,
    options,
    targetsToRemove,
}: {
    lifecycleTargets: LifecycleTargets;
    options: ProcessorOptions;
    targetsToRemove: Set<string>;
}): void => {
    for (const [stageName, { dependsOn }] of Object.entries(options.stages)) {
        if (dependsOn) {
            const filtered = removeDependencyTargets({
                target: { dependsOn },
                lifecycleTargets,
                targetsToRemove,
            });

            if (filtered.length !== dependsOn.length) {
                throw new Error(`Invalid dependency detected on lifecycle stage ${stageName}`);
            }
        }
    }
};

const processNxJson = ({
    nxJson,
    lifecycleTargets,
    registeredTargets,
    targetsToRemove,
}: {
    nxJson: NxJson;
    lifecycleTargets: LifecycleTargets;
    registeredTargets: RegisteredTargets;
    targetsToRemove: Set<string>;
}): NxJson => {
    const originalTargets = nxJson.targetDefaults ?? {};
    const targetDefaults = { ...originalTargets };
    const lifecycles: AllTargets = {};
    for (const [targetName, target] of lifecycleTargets.entries()) {
        lifecycles[targetName] = {
            executor: NOOP_EXECUTOR,
            dependsOn: [...target.dependsOn],
            configurations: {
                __lifecycle: {},
            },
        };
    }

    for (const [targetName, originalTarget] of Object.entries(targetDefaults)) {
        if (targetsToRemove.has(targetName) || lifecycleTargets.has(targetName)) {
            if ('__lifecycle' in (originalTarget.configurations ?? {})) {
                delete targetDefaults[targetName];
            } else {
                throw new Error(`Overlap in lifecycle hook and target: ${targetName}`);
            }
        } else {
            targetDefaults[targetName] = {
                ...originalTarget,
                dependsOn: removeDependencyTargets({
                    target: originalTarget,
                    lifecycleTargets,
                    targetsToRemove,
                }),
            };
        }
    }

    for (const [targetName, lifecycleTarget] of registeredTargets.entries()) {
        const registeredTarget = targetDefaults[targetName] ?? {};
        registeredTarget.dependsOn ??= [];
        registeredTarget.dependsOn.push(lifecycleTarget.previousHook);
        lifecycles[lifecycleTarget.name]!.dependsOn?.push(targetName);

        targetDefaults[targetName] = registeredTarget;
    }

    Object.assign(targetDefaults, lifecycles);

    for (const [targetName, target] of Object.entries(targetDefaults)) {
        if (target.dependsOn!.length === 0) {
            const originalTarget = originalTargets[targetName] ?? {};
            if (!originalTarget.dependsOn) {
                delete target.dependsOn;
            }
        }
    }

    return {
        ...nxJson,
        targetDefaults,
    };
};

const processProjectJson = ({
    projectJson,
    lifecycleTargets,
    registeredTargets,
    targetsToRemove,
}: {
    projectJson: ProjectJson;
    lifecycleTargets: LifecycleTargets;
    registeredTargets: RegisteredTargets;
    targetsToRemove: Set<string>;
}): ProjectJson => {
    const originalTargets = projectJson.targets ?? {};
    const targets = { ...originalTargets };
    const lifecycles: AllTargets = {};
    for (const targetName of lifecycleTargets.keys()) {
        lifecycles[targetName] = {};
    }

    for (const [targetName, target] of Object.entries(targets)) {
        if (targetsToRemove.has(targetName) || lifecycleTargets.has(targetName)) {
            delete targets[targetName];
        } else if (target.dependsOn) {
            const processedTarget = { ...target };
            targets[targetName] = processedTarget;
            processedTarget.dependsOn = removeDependencyTargets({
                target,
                lifecycleTargets,
                targetsToRemove,
            });

            const lifecycleTarget = registeredTargets.get(targetName);
            if (lifecycleTarget) {
                processedTarget.dependsOn.push(lifecycleTarget.previousHook);
            }
        }
    }

    const processedTargets = {
        ...targets,
        ...lifecycles,
    };

    if (!('targets' in projectJson) && isEmpty(processedTargets)) {
        return projectJson;
    }

    return {
        ...projectJson,
        targets: processedTargets,
    };
};

export type NxAndProjectJsonProcessor = ({
    nxJson,
    projectJsons,
    options,
}: {
    nxJson: NxJson;
    projectJsons: ProjectJson[];
    options: ProcessorOptions;
}) => {
    processedNxJson: NxJson;
    processedProjectJsons: ProjectJson[];
};
export const nxAndProjectJsonProcessorIdentifier = identifier<NxAndProjectJsonProcessor>();

export const processNxAndProjectJsons: NxAndProjectJsonProcessor = ({
    nxJson,
    projectJsons,
    options,
}: {
    nxJson: NxJson;
    projectJsons: ProjectJson[];
    options: ProcessorOptions;
}): {
    processedNxJson: NxJson;
    processedProjectJsons: ProjectJson[];
} => {
    const lifecycleTargets = calculateTargets(options);
    const targetsToRemove = calculateTargetsToRemove({
        lifecycleTargets,
        nxJson,
    });
    validateLifecycleDependencies({
        lifecycleTargets,
        options,
        targetsToRemove,
    });

    const registeredTargets = registerTargets({ options, lifecycleTargets });

    const processedNxJson = processNxJson({
        nxJson,
        lifecycleTargets,
        registeredTargets,
        targetsToRemove,
    });

    const processedProjectJsons = projectJsons.map(projectJson =>
        processProjectJson({
            projectJson,
            lifecycleTargets,
            targetsToRemove,
            registeredTargets,
        })
    );

    const response: ReturnType<typeof processNxAndProjectJsons> = {
        processedNxJson,
        processedProjectJsons,
    };

    if (!('targetDefaults' in nxJson) && isEmpty(processedNxJson.targetDefaults)) {
        delete response.processedNxJson.targetDefaults;
    }

    return response;
};

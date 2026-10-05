import type { ProjectGraph, TargetConfiguration } from '@nx/devkit';
import type { DependsOn } from '#schemas';
import type { LifecyclePlan } from './processor.js';

// Nx's own config may hold any dependency it accepts, not only those the lifecycle schema allows
type Dependency = DependsOn[number] | NonNullable<TargetConfiguration['dependsOn']>[number];

export interface DependencyExplanation {
    /**
     * Dependency as written, e.g. `prepare`, `^build` or `my-server:build`.
     */
    label: string;
    /**
     * For a `^` dependency, the upstream projects it runs the target of.
     */
    upstream?: readonly string[];
}

export interface BoundTargetExplanation {
    name: string;
    /**
     * Dependencies besides the hook the target is bound after.
     */
    dependsOn: readonly DependencyExplanation[];
}

export interface HookExplanation {
    name: string;
    targets: readonly BoundTargetExplanation[];
}

export interface StageExplanation {
    name: string;
    dependsOn: readonly DependencyExplanation[];
    /**
     * Hooks in order. A stage without hooks has a single entry, the stage itself.
     */
    hooks: readonly HookExplanation[];
    hasHooks: boolean;
}

export interface LifecycleExplanation {
    project: string;
    /**
     * Stages in the order they run, each after the stages it depends on.
     */
    stages: readonly StageExplanation[];
}

const normalizeDependency = (
    dependency: Dependency
): { target: string; dependencies?: boolean; projects?: string | string[] } => {
    if (typeof dependency !== 'string') {
        return dependency;
    }
    if (dependency.startsWith('^')) {
        return { target: dependency.slice(1), dependencies: true };
    }
    return { target: dependency };
};

/**
 * Nx runs a `^` dependency on each upstream project with the target.
 * A project without it is skipped, and its own upstream projects are checked instead.
 *
 * @param graph - project graph
 * @param projectName - project whose upstream projects to resolve
 * @param target - name of the target
 * @returns upstream projects that run the target, in graph order
 */
const resolveUpstream = (graph: ProjectGraph, projectName: string, target: string): string[] => {
    const upstream = new Set<string>();
    const visited = new Set<string>([projectName]);

    const visit = (name: string): void => {
        for (const dependency of graph.dependencies[name] ?? []) {
            const node = graph.nodes[dependency.target];
            // External npm nodes and already checked projects
            if (!node || visited.has(dependency.target)) {
                continue;
            }
            visited.add(dependency.target);
            if (node.data.targets && target in node.data.targets) {
                upstream.add(dependency.target);
            } else {
                visit(dependency.target);
            }
        }
    };
    visit(projectName);

    return [...upstream];
};

const explainDependency = (
    graph: ProjectGraph,
    projectName: string,
    dependency: Dependency
): DependencyExplanation => {
    const { target, dependencies, projects } = normalizeDependency(dependency);
    if (dependencies) {
        return {
            label: `^${target}`,
            upstream: resolveUpstream(graph, projectName, target),
        };
    }
    if (projects !== undefined) {
        return {
            label: [projects]
                .flat()
                .map(project => `${project}:${target}`)
                .join(', '),
        };
    }
    return { label: target };
};

/**
 * Stages run after the stages of the same project they depend on.
 * Otherwise, they keep the order they are declared in.
 *
 * @param plan - lifecycle targets
 * @param stageDependencies - stages each stage depends on in the same project
 * @param stage - only order this stage, and the stages it depends on
 * @returns stage names in run order
 */
const orderStages = (
    plan: LifecyclePlan,
    stageDependencies: ReadonlyMap<string, readonly string[]>,
    stage: string | undefined
): string[] => {
    const ordered: string[] = [];
    const visited = new Set<string>();

    const visit = (name: string): void => {
        // Nx rejects circular dependencies, so a revisit is already ordered
        if (visited.has(name)) {
            return;
        }
        visited.add(name);
        for (const dependency of stageDependencies.get(name)!) {
            visit(dependency);
        }
        ordered.push(name);
    };

    if (stage === undefined) {
        for (const [name, target] of plan.lifecycleTargets) {
            if (target.kind === 'base') {
                visit(name);
            }
        }
    } else {
        visit(stage);
    }

    return ordered;
};

/**
 * Describes what runs, and in which order, for the stages of one project.
 *
 * Stage dependencies come from the lifecycle configuration.
 * Bound targets, and their other dependencies, come from the merged project configuration,
 * so they match what Nx runs.
 *
 * @param params - required
 * @param params.plan - lifecycle targets and bindings
 * @param params.graph - project graph, with merged project configurations
 * @param params.project - name of the project to explain
 * @param [params.stage] - only explain this stage, and the stages it runs after
 * @returns stages in run order
 * @throws {Error} when the project or stage does not exist
 */
export const explainLifecycle = ({
    plan,
    graph,
    project,
    stage,
}: {
    plan: LifecyclePlan;
    graph: ProjectGraph;
    project: string;
    stage?: string;
}): LifecycleExplanation => {
    const node = graph.nodes[project];
    if (!node) {
        throw new Error(`Project ${project} not found`);
    }
    const targets = node.data.targets ?? {};

    const stageNames = [...plan.lifecycleTargets.values()]
        .filter(target => target.kind === 'base')
        .map(target => target.name);
    if (stage !== undefined && !stageNames.includes(stage)) {
        throw new Error(`Stage ${stage} not found. Stages: ${stageNames.join(', ')}`);
    }

    const stageDependencies = new Map<string, string[]>();
    for (const stageName of stageNames) {
        const anchor = plan.lifecycleTargets.get(`${stageName}:_`)!;
        stageDependencies.set(
            stageName,
            anchor.dependsOn
                .map(dependency => normalizeDependency(dependency))
                .filter(
                    ({ target, dependencies, projects }) =>
                        !dependencies && projects === undefined && stageNames.includes(target)
                )
                .map(({ target }) => target)
        );
    }

    const explainTarget = (targetName: string, previousHook: string): BoundTargetExplanation => ({
        name: targetName,
        dependsOn: (targets[targetName]?.dependsOn ?? [])
            .filter(dependency => {
                const normalized = normalizeDependency(dependency);
                return (
                    normalized.target !== previousHook ||
                    normalized.dependencies !== undefined ||
                    normalized.projects !== undefined
                );
            })
            .map(dependency => explainDependency(graph, project, dependency)),
    });

    const stages = orderStages(plan, stageDependencies, stage).map(
        (stageName): StageExplanation => {
            const base = plan.lifecycleTargets.get(stageName)!;
            const anchor = plan.lifecycleTargets.get(`${stageName}:_`)!;
            const hookTargets = [...plan.lifecycleTargets.values()].filter(
                target =>
                    target.stage === stageName &&
                    (target.kind === 'hook' || (target.kind === 'base' && !target.hasHooks))
            );

            return {
                name: stageName,
                dependsOn: anchor.dependsOn.map(dependency =>
                    explainDependency(graph, project, dependency)
                ),
                hooks: hookTargets.map(hook => ({
                    name: hook.name,
                    targets: [...plan.registeredTargets]
                        .filter(
                            ([targetName, lifecycleTarget]) =>
                                lifecycleTarget.name === hook.name && targetName in targets
                        )
                        .map(([targetName, lifecycleTarget]) =>
                            explainTarget(targetName, lifecycleTarget.previousHook)
                        ),
                })),
                hasHooks: base.kind === 'base' && base.hasHooks,
            };
        }
    );

    return { project, stages };
};

const formatDependencies = (dependencies: readonly DependencyExplanation[]): string =>
    dependencies
        .map(({ label, upstream }) => {
            if (!upstream) {
                return label;
            }
            return `${label} (${upstream.length > 0 ? upstream.join(', ') : 'no upstream projects'})`;
        })
        .join('; ');

// Lines of a stage line up after its number, e.g. `1. `
const STAGE_INDENT = ' '.repeat('1. '.length);
const HOOK_TARGET_INDENT = `${STAGE_INDENT}  `;

/**
 * Prints an explanation as an indented outline.
 *
 * @param explanation - stages of a project
 * @returns human readable outline
 */
export const formatExplanation = ({ project, stages }: LifecycleExplanation): string => {
    const lines = [project];

    for (const [index, stage] of stages.entries()) {
        lines.push('', `${index + 1}. ${stage.name}`);
        if (stage.dependsOn.length > 0) {
            lines.push(`${STAGE_INDENT}after: ${formatDependencies(stage.dependsOn)}`);
        }

        for (const hook of stage.hooks) {
            // Targets bound to a stage without hooks are listed under the stage itself
            const indent = stage.hasHooks ? HOOK_TARGET_INDENT : STAGE_INDENT;
            if (stage.hasHooks) {
                lines.push(
                    `${STAGE_INDENT}${hook.name}${hook.targets.length > 0 ? '' : ' (nothing bound)'}`
                );
            }
            for (const target of hook.targets) {
                const after =
                    target.dependsOn.length > 0
                        ? ` (also after: ${formatDependencies(target.dependsOn)})`
                        : '';
                lines.push(`${indent}${target.name}${after}`);
            }
        }
    }

    return lines.join('\n');
};

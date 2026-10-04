import type {
    CreateDependencies,
    CreateDependenciesContext,
    CreateNodesContextV2,
    CreateNodesResult,
    CreateNodesResultV2,
    CreateNodesV2,
    ProjectConfiguration,
    TargetConfiguration,
} from '@nx/devkit';
import type { AssertProjectJson, DependsOn } from '#schemas';
import type { LifecyclePlan, LifecycleTarget } from '../lifecycle/processor.js';
import type { PluginLogger, ReadJsonFile } from './dependencies.js';
import type { AssertLifecyclePluginOptions, LifecyclePluginOptions } from './schema.js';
import Path from 'node:path';
import { createNodesFromFiles } from '@nx/devkit';
import { deepEqual } from 'fast-equals';
import { NOOP_EXECUTOR } from '../lifecycle/constants.js';
import { planLifecycle } from '../lifecycle/processor.js';

type Dependency = DependsOn[number];

const describeTarget = ({ kind, name, stage }: LifecycleTarget): string => {
    if (kind === 'anchor') {
        return `Start of the ${stage} stage. Waits for the dependencies of the stage`;
    }
    if (kind === 'hook') {
        return `Runs the targets bound to ${name}`;
    }
    return `Runs the ${stage} stage`;
};

/**
 * Nx accepts both `"target"` and `{ "target": "target" }`, and `"^target"` for dependencies.
 *
 * @param dependency - entry of a target's `dependsOn`
 * @returns comparable form of the dependency
 */
const normalizeDependency = (dependency: Dependency): Exclude<Dependency, string> => {
    if (typeof dependency !== 'string') {
        return dependency;
    }
    if (dependency.startsWith('^')) {
        return { target: dependency.slice(1), dependencies: true };
    }
    return { target: dependency };
};

const dependsOnIncludes = (
    dependsOn: TargetConfiguration['dependsOn'],
    expected: Dependency
): boolean => {
    const normalizedExpected = normalizeDependency(expected);
    return (dependsOn ?? []).some(dependency =>
        deepEqual(normalizeDependency(dependency as Dependency), normalizedExpected)
    );
};

/**
 * Checks the merged configuration of a project still runs bound targets in their stage.
 *
 * @param project - merged project configuration
 * @param plan - lifecycle targets and bindings
 * @returns problems with the wiring of the project, without the project name so they can be grouped
 */
const validateProject = (
    { targets = {} }: ProjectConfiguration,
    { lifecycleTargets, registeredTargets }: LifecyclePlan
): string[] => {
    const errors: string[] = [];

    for (const [targetName, lifecycleTarget] of lifecycleTargets) {
        const target = targets[targetName];
        if (
            target &&
            (target.executor !== NOOP_EXECUTOR ||
                !lifecycleTarget.dependsOn.every(dependency =>
                    dependsOnIncludes(target.dependsOn, dependency)
                ))
        ) {
            errors.push(
                `${targetName} is inferred by nx-lifecycle, but project.json or nx.json targetDefaults override it. Remove it from there`
            );
        }
    }

    for (const [targetName, lifecycleTarget] of registeredTargets) {
        const target = targets[targetName];
        const hook = targets[lifecycleTarget.name];
        if (!target) {
            continue;
        }
        if (!hook) {
            errors.push(
                `${targetName} is bound to ${lifecycleTarget.name}, but nx-lifecycle only adds lifecycle targets to projects with a project.json. Add one`
            );
        } else if (!dependsOnIncludes(hook.dependsOn, targetName)) {
            errors.push(
                `${targetName} is bound to ${lifecycleTarget.name}, but is not declared in project.json. Declare it there so nx-lifecycle can wire it`
            );
        } else if (!dependsOnIncludes(target.dependsOn, lifecycleTarget.previousHook)) {
            errors.push(
                `${targetName} is bound to ${lifecycleTarget.name}, so it must depend on ${lifecycleTarget.previousHook}. A dependsOn in project.json or nx.json targetDefaults replaces the inferred one, so add "${lifecycleTarget.previousHook}" to it`
            );
        }
    }

    return errors;
};

/**
 * Nx plugin that infers lifecycle targets, instead of writing them to `nx.json` and `project.json`.
 *
 * `createNodes` adds the anchor, hook and stage targets to every project with a `project.json`,
 * and wires the bound targets declared there.
 *
 * Nx applies `nx.json` `targetDefaults` and `project.json` on top of inferred targets,
 * replacing `dependsOn` rather than merging it.
 * `createDependencies` runs on the merged configuration, and fails if a bound target lost its wiring.
 */
export class LifecyclePlugin {
    readonly #assertOptions: AssertLifecyclePluginOptions;
    readonly #readJsonFile: ReadJsonFile;
    readonly #assertProjectJson: AssertProjectJson;
    readonly #logger: PluginLogger;

    public readonly createNodes: CreateNodesV2<LifecyclePluginOptions>;
    public readonly createDependencies: (
        ...args: Parameters<CreateDependencies<LifecyclePluginOptions>>
    ) => [];

    public constructor(
        assertOptions: AssertLifecyclePluginOptions,
        readJsonFile: ReadJsonFile,
        assertProjectJson: AssertProjectJson,
        logger: PluginLogger
    ) {
        this.#assertOptions = assertOptions;
        this.#readJsonFile = readJsonFile;
        this.#assertProjectJson = assertProjectJson;
        this.#logger = logger;

        this.createNodes = ['**/project.json', this.#createNodes.bind(this)];
        this.createDependencies = this.#createDependencies.bind(this);
    }

    #plan(options: LifecyclePluginOptions | undefined): LifecyclePlan {
        try {
            this.#assertOptions(options);
        } catch (err) {
            // Ajv errors, which Nx would not print
            const issues = (err as Error).cause as { instancePath: string; message: string }[];
            throw new Error(
                [
                    'Invalid nx-lifecycle plugin options in nx.json:',
                    ...issues.map(
                        ({ instancePath, message }) => `- options${instancePath} ${message}`
                    ),
                ].join('\n'),
                { cause: err }
            );
        }
        return planLifecycle(options);
    }

    async #createNodes(
        projectJsonPaths: readonly string[],
        options: LifecyclePluginOptions | undefined,
        context: CreateNodesContextV2
    ): Promise<CreateNodesResultV2> {
        const plan = this.#plan(options);

        return createNodesFromFiles(
            projectJsonPath => this.#createProjectNode(projectJsonPath, plan, context),
            projectJsonPaths,
            options,
            context
        );
    }

    #createProjectNode(
        projectJsonPath: string,
        { lifecycleTargets, registeredTargets }: LifecyclePlan,
        context: CreateNodesContextV2
    ): CreateNodesResult {
        const projectJson = this.#readJsonFile(Path.join(context.workspaceRoot, projectJsonPath));
        this.#assertProjectJson(projectJson);
        const declaredTargets = projectJson.targets ?? {};

        const targets: Record<
            string,
            Required<Pick<TargetConfiguration, 'dependsOn'>> & TargetConfiguration
        > = {};
        for (const [targetName, lifecycleTarget] of lifecycleTargets) {
            targets[targetName] = {
                executor: NOOP_EXECUTOR,
                // The schema validates `params`, but types it as a plain string
                dependsOn: [...lifecycleTarget.dependsOn] as NonNullable<
                    TargetConfiguration['dependsOn']
                >,
                metadata: {
                    description: describeTarget(lifecycleTarget),
                },
            };
        }

        for (const [targetName, lifecycleTarget] of registeredTargets) {
            if (targetName in declaredTargets) {
                targets[lifecycleTarget.name]!.dependsOn.push(targetName);
                targets[targetName] = {
                    dependsOn: [lifecycleTarget.previousHook],
                };
            }
        }

        return {
            projects: {
                [Path.dirname(projectJsonPath)]: { targets },
            },
        };
    }

    #createDependencies(
        options: LifecyclePluginOptions | undefined,
        context: CreateDependenciesContext
    ): [] {
        const plan = this.#plan(options);

        // The same problem in many projects usually comes from nx.json targetDefaults, so report it once
        const errors = new Map<string, string[]>();
        const definedTargets = new Set<string>();

        for (const [projectName, project] of Object.entries(context.projects)) {
            for (const error of validateProject(project, plan)) {
                const projectNames = errors.get(error) ?? [];
                projectNames.push(projectName);
                errors.set(error, projectNames);
            }
            for (const targetName of Object.keys(project.targets ?? {})) {
                definedTargets.add(targetName);
            }
        }

        if (errors.size > 0) {
            throw new Error(
                [
                    'nx-lifecycle targets are not wired as configured:',
                    ...[...errors].map(
                        ([error, projectNames]) =>
                            `- ${error}\n  Projects: ${projectNames.join(', ')}`
                    ),
                ].join('\n')
            );
        }

        for (const targetName of plan.registeredTargets.keys()) {
            if (!definedTargets.has(targetName)) {
                this.#logger.warn(
                    `Bound target ${targetName} is not defined in any project. Is it a typo?`
                );
            }
        }

        return [];
    }
}

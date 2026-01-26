import type { ProjectConfiguration, ProjectGraph, TargetConfiguration } from '@nx/devkit';
import type { PopulateFiles } from 'populate-files';
import type { GetGitIgnore } from './git-ignore.js';
import type { GenerateGoFile } from './go-generator.js';
import type { TemplateContext } from './lib/types.js';
import type { NormalizeOptions } from './normalizer.js';
import type { DaggerOptions, DaggerOptionsOrConfig } from './schema.js';
import Path from 'node:path';

export type NxDagger = (
    projectGraph: ProjectGraph,
    configOptions: DaggerOptionsOrConfig
) => Promise<void>;

export const constructContext = (
    params: Pick<DaggerOptions, 'constructorArguments' | 'dagger' | 'runtimes' | 'targets'> & {
        gitIgnore: string[];
        projectGraph: {
            dependencies: Record<string, { target: string }[]>;
            nodes: Record<
                string,
                {
                    data: {
                        root: string;
                        targets?: Record<string, TargetConfiguration>;
                        metadata?: ProjectConfiguration['metadata'] | Record<string, string>;
                    };
                }
            >;
        };
    }
): TemplateContext => {
    const constructorArguments: TemplateContext['constructorArguments'] = new Map();
    for (const [key, val] of Object.entries(params.constructorArguments)) {
        constructorArguments.set(key, {
            name: key,
            type: val,
        });
    }

    const runtimes: TemplateContext['runtimes'] = new Map();
    for (const [key, val] of Object.entries(params.runtimes)) {
        runtimes.set(key, {
            name: key,
            preBuild: val.preBuild,
            postBuild: val.postBuild,
        });
    }

    const targets: TemplateContext['targets'] = new Map();
    const pluginToTargetMap = new Map<string, string>();
    for (const [key, val] of Object.entries(params.targets)) {
        targets.set(key, {
            name: key,
            constructorArguments: val.constructorArguments,
            isCi: val.kind === 'ci',
            parameters: val.parameters,
        });
        for (const pluginName of val.pluginNames ?? [key]) {
            pluginToTargetMap.set(pluginName, key);
        }
    }

    const projectDirectDependencies = new Map<string, Set<string>>();
    for (const projectName of Object.keys(params.projectGraph.nodes)) {
        const directDependencies = params.projectGraph.dependencies[projectName]!.map(
            dependency => dependency.target
        ).filter(target => target in params.projectGraph.nodes);
        projectDirectDependencies.set(projectName, new Set(directDependencies));
    }
    const projectDependencies = new Map<string, Set<string>>();
    const computeDependencies = (projectName: string): Set<string> => {
        if (projectDependencies.has(projectName)) {
            return projectDependencies.get(projectName)!;
        }
        const directDependencies = projectDirectDependencies.get(projectName)!;
        let dependencies = directDependencies;
        for (const directDependency of directDependencies) {
            dependencies = dependencies.union(computeDependencies(directDependency));
        }
        projectDependencies.set(projectName, dependencies);
        return dependencies;
    };
    for (const projectName of Object.keys(params.projectGraph.nodes)) {
        computeDependencies(projectName);
    }

    const projects: TemplateContext['projects'] = new Map();
    for (const [projectName, projectNode] of Object.entries(params.projectGraph.nodes)) {
        const runtime = (projectNode.data.metadata as Record<string, string>).daggerRuntime;
        if (!runtime) {
            continue;
        }

        const projectTargetDependencies = new Map(
            Object.entries(projectNode.data.targets!).map(([targetName, targetConfig]) => {
                const targetDependencies = (targetConfig.dependsOn ?? [])
                    .map(dependsOn => {
                        if (typeof dependsOn === 'string') {
                            if (dependsOn.startsWith('^')) {
                                return null;
                            }
                            return dependsOn;
                        }
                        if (dependsOn.dependencies || 'projects' in dependsOn) {
                            return null;
                        }
                        return dependsOn.target;
                    })
                    .filter(
                        (dependencyTargetName: string | null): dependencyTargetName is string =>
                            !!dependencyTargetName
                    );

                return [targetName, targetDependencies];
            })
        );
        const computedTargets = new Set<string>();
        const projectTargets: string[] = [];
        // eslint-disable-next-line unicorn/consistent-function-scoping
        const computeAndAddTarget = (projectTarget: string): void => {
            if (computedTargets.has(projectTarget)) {
                return;
            }
            for (const dependency of projectTargetDependencies.get(projectTarget) ?? []) {
                computeAndAddTarget(dependency);
            }
            computedTargets.add(projectTarget);
            if (
                projectTargetDependencies.has(projectTarget) &&
                pluginToTargetMap.has(projectTarget)
            ) {
                projectTargets.push(pluginToTargetMap.get(projectTarget)!);
            }
        };
        const inOrderTargets = [...projectTargetDependencies.keys()].toSorted((a, b) =>
            a.localeCompare(b, 'en')
        );
        for (const projectTarget of inOrderTargets) {
            computeAndAddTarget(projectTarget);
        }

        projects.set(projectName, {
            runtime,
            name: projectName.replaceAll(/[@\\]/gu, ''),
            directory: projectNode.data.root,
            directDependencies: [...projectDirectDependencies.get(projectName)!].toSorted((a, b) =>
                a.localeCompare(b, 'en')
            ),
            dependencies: [...projectDependencies.get(projectName)!].toSorted((a, b) =>
                a.localeCompare(b, 'en')
            ),
            targets: projectTargets,
        });
    }

    return {
        constructorArguments,
        runtimes,
        targets,
        projects,
        dagger: params.dagger,
        gitIgnore: params.gitIgnore,
    };
};

export const nxDaggerProvider =
    (
        nxWorkspace: string,
        getGitIgnore: GetGitIgnore,
        normalizeOptions: NormalizeOptions,
        generateGoFile: GenerateGoFile,
        populateFiles: PopulateFiles
    ): NxDagger =>
    async (projectGraph: ProjectGraph, configOptions: DaggerOptionsOrConfig): Promise<void> => {
        const [gitIgnore, normalizedOptions] = await Promise.all([
            getGitIgnore(),
            normalizeOptions(configOptions),
        ]);

        const goFiles = await generateGoFile(
            constructContext({
                ...normalizedOptions,
                gitIgnore,
                projectGraph,
            })
        );

        await populateFiles(
            [
                {
                    filePath: Path.join(nxWorkspace, normalizedOptions.dagger.directory, 'main.go'),
                    content: goFiles.main,
                },
                {
                    filePath: Path.join(
                        nxWorkspace,
                        normalizedOptions.dagger.directory,
                        `${Path.basename(normalizedOptions.dagger.directory)}-builder`,
                        'main.go'
                    ),
                    content: goFiles.builder,
                },
            ],
            {
                check: normalizedOptions.check,
                dryRun: normalizedOptions.dryRun,
            }
        );
    };

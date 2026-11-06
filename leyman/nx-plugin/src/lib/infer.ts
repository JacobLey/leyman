import type { ResolvedOptions, TargetName } from './options.js';
import { targetNames } from './options.js';

/**
 * The fields of a project's `package.json` inference reads.
 */
export interface InferencePackageJson {
    readonly private?: boolean;
    readonly devDependencies?: Readonly<Record<string, string>>;
}

/**
 * What inference knows of a project.
 */
export interface ProjectFacts {
    /**
     * Root of the project, relative to the workspace, with `/` separators.
     */
    readonly root: string;
    /**
     * Its `package.json`, if it has one.
     */
    readonly packageJson: InferencePackageJson | undefined;
    /**
     * Whether another package of the workspace depends on it.
     */
    readonly isDependency: boolean;
    /**
     * Whether a file or directory exists in the project.
     *
     * @param path - relative to the project root
     */
    readonly has: (path: string) => boolean;
}

/**
 * Which targets a project's files call for, before options.
 *
 * @param project - its files, `package.json` and dependents
 * @returns each target's own name
 */
const targetsFromFiles = ({ has, isDependency, packageJson }: ProjectFacts): Set<TargetName> => {
    const targets = new Set<TargetName>(['biome']);
    if (packageJson === undefined) {
        return targets;
    }
    if (isDependency) {
        targets.add('sync-injected');
    }
    if (has('tsconfig.json')) {
        targets.add('update-ts-references');
        if (has('src')) {
            targets.add('tsc');
        }
    }
    if (has('test/tsconfig.json')) {
        targets.add('tsc-test');
    }
    const devDependencies = packageJson.devDependencies ?? {};
    if (Object.hasOwn(devDependencies, 'mocha')) {
        if (has('test/unit')) {
            targets.add('mocha-unit-test');
        }
        if (has('test/integration')) {
            targets.add('mocha-integration-test');
        }
    } else if (Object.hasOwn(devDependencies, 'vitest') && has('test/unit')) {
        targets.add('vitest-unit-test');
    }
    if (has('eslint.config.js')) {
        targets.add('eslint');
    }
    if (targets.has('tsc')) {
        const tested = ['mocha-unit-test', 'mocha-integration-test', 'vitest-unit-test'] as const;
        if (tested.some(target => targets.has(target))) {
            targets.add('coverage-report');
        }
        if (packageJson.private !== true) {
            targets.add('check-package');
        }
    }
    return targets;
};

/**
 * Which of the plugin's targets a project gets: those its files call for, plus those it is included in, minus those it
 * is excluded from or turned off.
 *
 * @param project - its root, files, `package.json` and dependents
 * @param options - resolved options
 * @returns each target's own name, in the order a `project.json` lists them
 */
export const inferTargets = (project: ProjectFacts, options: ResolvedOptions): TargetName[] => {
    const fromFiles = targetsFromFiles(project);
    return targetNames.filter(target => {
        const targetOptions = options.targets[target];
        return (
            targetOptions !== false &&
            !targetOptions.exclude.includes(project.root) &&
            (fromFiles.has(target) || targetOptions.include.includes(project.root))
        );
    });
};

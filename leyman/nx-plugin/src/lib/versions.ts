import type { Tree } from '@nx/devkit';
import { readFile } from 'node:fs/promises';
import { getProjects, joinPathFragments, readJson } from '@nx/devkit';
import { parse } from 'yaml';

type Dependencies = Readonly<Record<string, string>>;

interface DependentPackageJson {
    readonly name?: string;
    readonly dependencies?: Dependencies;
    readonly devDependencies?: Dependencies;
    readonly optionalDependencies?: Dependencies;
    readonly peerDependencies?: Dependencies;
}

/**
 * Where a generator finds the version of a dependency it adds.
 */
export interface WorkspaceVersions {
    /**
     * Names of the workspace's own packages.
     */
    readonly packages: ReadonlySet<string>;
    /**
     * Each pnpm catalog, by name, with `default` for `catalog:`.
     */
    readonly catalogs: Readonly<Record<string, Dependencies>>;
    /**
     * A range a workspace package already depends on each package by.
     */
    readonly ranges: ReadonlyMap<string, string>;
    /**
     * Versions this plugin was published with, as a last resort.
     */
    readonly fallback: Dependencies;
}

const isProtocol = (range: string): boolean => /^(?:catalog|workspace):/v.test(range);

/**
 * The plugin itself, and its own `devDependencies` with a version, which the published package has for every tool its
 * targets run.
 *
 * @returns each version, by package
 */
const ownVersions = async (): Promise<Dependencies> => {
    const path = new URL(import.meta.resolve('@leyman/nx-plugin/package.json'));
    const {
        name,
        version,
        devDependencies = {},
    } = JSON.parse(await readFile(path, 'utf8')) as DependentPackageJson & {
        name: string;
        version: string;
    };
    return {
        ...Object.fromEntries(
            Object.entries(devDependencies).filter(([, range]) => !isProtocol(range))
        ),
        [name]: `^${version}`,
    };
};

/**
 * Reads the workspace's packages, pnpm catalogs and dependency ranges, for {@link resolveVersion}.
 *
 * @param tree - Nx's view of the files
 * @returns the sources `resolveVersion` picks from
 */
export const readWorkspaceVersions = async (tree: Tree): Promise<WorkspaceVersions> => {
    const packages = new Set<string>();
    const ranges = new Map<string, string>();
    for (const { root } of getProjects(tree).values()) {
        const path = joinPathFragments(root, 'package.json');
        if (!tree.exists(path)) {
            continue;
        }
        const packageJson = readJson<DependentPackageJson>(tree, path);
        if (packageJson.name !== undefined) {
            packages.add(packageJson.name);
        }
        const entries = [
            packageJson.dependencies,
            packageJson.devDependencies,
            packageJson.optionalDependencies,
            packageJson.peerDependencies,
        ].flatMap(field => (field === undefined ? [] : Object.entries(field)));
        for (const [name, range] of entries) {
            if (!ranges.has(name) && !range.startsWith('workspace:')) {
                ranges.set(name, range);
            }
        }
    }

    const workspaceYaml = tree.read('pnpm-workspace.yaml', 'utf8');
    const { catalog, catalogs } = (workspaceYaml === null ? {} : (parse(workspaceYaml) ?? {})) as {
        catalog?: Dependencies;
        catalogs?: Record<string, Dependencies>;
    };

    return {
        packages,
        ranges,
        catalogs: { ...catalogs, ...(catalog !== undefined && { default: catalog }) },
        fallback: await ownVersions(),
    };
};

/**
 * The range to depend on a package by: `workspace:^` for one of the workspace's own, else `catalog:` from the default
 * catalog, else a range another workspace package uses, else the version this plugin was published with.
 *
 * @param name - the package
 * @param versions - from {@link readWorkspaceVersions}
 * @returns the range, as `package.json` writes it
 * @throws {Error} when nothing has a version of the package
 */
export const resolveVersion = (name: string, versions: WorkspaceVersions): string => {
    if (versions.packages.has(name)) {
        return 'workspace:^';
    }
    if (versions.catalogs.default?.[name] !== undefined) {
        return 'catalog:';
    }
    const range = versions.ranges.get(name) ?? versions.fallback[name];
    if (range === undefined) {
        throw new Error(
            `No version of ${name} in the workspace: add it to the pnpm catalog or to a package first`
        );
    }
    return range;
};

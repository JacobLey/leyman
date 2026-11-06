import type { InferencePackageJson, ProjectFacts } from './infer.js';
import { access, readFile } from 'node:fs/promises';
import Path from 'node:path';
import { inferencePaths } from './infer.js';

/**
 * The fields of a workspace package's `package.json` the plugin reads.
 */
export interface WorkspacePackageJson extends InferencePackageJson {
    readonly name?: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
}

/**
 * A project as inference sees it, with its `project.json` if it has one.
 */
export interface LoadedProject extends ProjectFacts {
    readonly projectJson: Record<string, unknown> | undefined;
}

export const readJson = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(path, 'utf8'));

const isPresent = async (path: string): Promise<boolean> => {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
};

const readJsonIfPresent = async (path: string): Promise<unknown> =>
    (await isPresent(path)) ? readJson(path) : undefined;

/**
 * Reads what inference needs of each project: its files, its `package.json`, and whether another of the projects
 * depends on it.
 *
 * @param workspaceRoot - absolute path the roots are relative to
 * @param roots - root of each project, relative to the workspace root
 * @returns each project, in the order of `roots`
 */
export const loadProjects = async (
    workspaceRoot: string,
    roots: readonly string[]
): Promise<LoadedProject[]> => {
    const loaded = await Promise.all(
        roots.map(async root => {
            const projectRoot = Path.join(workspaceRoot, root);
            const [projectJson, packageJson, present] = await Promise.all([
                readJsonIfPresent(Path.join(projectRoot, 'project.json')),
                readJsonIfPresent(Path.join(projectRoot, 'package.json')),
                Promise.all(
                    inferencePaths.map(async path => isPresent(Path.join(projectRoot, path)))
                ),
            ]);
            return {
                // Nx gives `.` for the workspace root
                root: root.replaceAll(Path.sep, '/'),
                present: new Set(inferencePaths.filter((_path, i) => present[i] === true)),
                projectJson: projectJson as Record<string, unknown> | undefined,
                packageJson: packageJson as WorkspacePackageJson | undefined,
            };
        })
    );
    const dependencies = new Set(
        loaded.flatMap(({ packageJson }) =>
            [
                packageJson?.dependencies,
                packageJson?.devDependencies,
                packageJson?.optionalDependencies,
                packageJson?.peerDependencies,
            ].flatMap(field => Object.keys(field ?? {}))
        )
    );
    return loaded.map(({ packageJson, present, projectJson, root }) => ({
        packageJson,
        projectJson,
        root,
        isDependency: packageJson?.name !== undefined && dependencies.has(packageJson.name),
        has: path => present.has(path),
    }));
};

import type { TargetConfiguration } from '@nx/devkit';
import type { InferencePackageJson } from './infer.js';
import type { NxPluginOptions, ResolvedOptions, TargetName } from './options.js';
import { access, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { inferencePaths, inferTargets } from './infer.js';
import { namedInputNames, resolveOptions, targetNames } from './options.js';
import { assertOptions } from './schema.js';
import { namedInputs, targetConfigurations } from './targets.js';

type JsonObject = Record<string, unknown>;

interface WorkspacePackageJson extends InferencePackageJson {
    readonly name?: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

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
 * Sets each entry of `updates` on `object`, keeping the position of keys it already has, and removes
 * those set to `undefined`.
 *
 * @param object - the original
 * @param updates - new values by key, `undefined` to remove
 * @param place - where a new key goes: after the key returned, or first for `undefined`
 * @returns a copy of the object with the updates
 */
const updateKeys = (
    object: JsonObject,
    updates: ReadonlyMap<string, unknown>,
    place: (key: string, keys: readonly string[]) => string | undefined = (_key, keys) =>
        keys.at(-1)
): JsonObject => {
    const keys = Object.keys(object);
    for (const [key, value] of updates) {
        if (value === undefined || keys.includes(key)) {
            continue;
        }

        const after = place(key, keys);
        keys.splice(after === undefined ? 0 : keys.indexOf(after) + 1, 0, key);
    }
    const entries = keys.map((key): [string, unknown] => [
        key,
        updates.has(key) ? updates.get(key) : object[key],
    ]);
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
};

/**
 * `nx.json` with the plugin's named inputs and target defaults. Each target default keeps its `dependsOn`, which
 * nx-lifecycle writes.
 *
 * @param nxJson - the current `nx.json`
 * @param options - resolved options
 * @returns the updated `nx.json`
 */
const updateNxJson = (nxJson: JsonObject, options: ResolvedOptions): JsonObject => {
    const inputs = namedInputs(options);
    const configurations = targetConfigurations(options);
    const targetDefaults = (nxJson.targetDefaults ?? {}) as Record<string, TargetConfiguration>;

    const defaults = new Map<string, unknown>();
    for (const target of targetNames) {
        const targetOptions = options.targets[target];
        if (targetOptions === false) {
            continue;
        }
        const { dependsOn } = targetDefaults[targetOptions.name] ?? {};
        defaults.set(targetOptions.name, {
            ...configurations[target],
            ...(dependsOn !== undefined && { dependsOn }),
        });
    }
    const ownNamedInputs = new Map(namedInputNames.map(name => [name, inputs[name]]));

    return updateKeys(
        nxJson,
        new Map([
            ['namedInputs', updateKeys((nxJson.namedInputs ?? {}) as JsonObject, ownNamedInputs)],
            ['targetDefaults', updateKeys(targetDefaults, defaults)],
        ])
    );
};

/**
 * A project's `project.json` declaring exactly the plugin's targets it gets: those inferred are added as `{}`, and
 * others removed, unless they hold configuration of their own.
 *
 * @param projectJson - the current `project.json`
 * @param inferred - each target the project gets
 * @param options - resolved options
 * @returns the updated `project.json`
 */
const updateProjectJson = (
    projectJson: JsonObject,
    inferred: readonly TargetName[],
    options: ResolvedOptions
): JsonObject => {
    const targets = (projectJson.targets ?? {}) as JsonObject;
    const names = targetNames.map(target => {
        const targetOptions = options.targets[target];
        return targetOptions === false ? target : targetOptions.name;
    });
    const updates = new Map<string, unknown>();
    for (const [i, target] of targetNames.entries()) {
        const name = names[i]!;
        const current = targets[name];
        if (inferred.includes(target)) {
            updates.set(name, current ?? {});
        } else if (isDeepStrictEqual(current, {})) {
            updates.set(name, undefined);
        }
    }
    return updateKeys(
        projectJson,
        new Map([
            [
                'targets',
                // After the plugin's targets listed before it, so a new one lands in the usual order
                updateKeys(targets, updates, (key, keys) =>
                    names.slice(0, names.indexOf(key)).findLast(name => keys.includes(name))
                ),
            ],
        ])
    );
};

/**
 * A project of the workspace, as Nx knows it.
 */
export interface WorkspaceProject {
    readonly name: string;
    /**
     * Relative to the workspace root.
     */
    readonly root: string;
}

/**
 * Writes the plugin's named inputs and target defaults into `nx.json`, and the targets each project gets into its
 * `project.json`, for a workspace that runs the plugin's targets without loading it as a plugin.
 *
 * @param params - what to update, and how
 * @param params.root - the workspace root
 * @param params.projects - every project of the workspace
 * @param params.options - plugin options, not yet validated
 * @param params.optionsSource - where the options are from, for errors
 * @param params.check - fail rather than write when a file is out of date
 * @returns the path of each file written, or that would be
 * @rejects {Error} when the options are invalid, or a file is out of date in `check` mode
 */
export const syncTargets = async ({
    root,
    projects,
    options,
    optionsSource,
    check,
}: {
    root: string;
    projects: readonly WorkspaceProject[];
    options: unknown;
    optionsSource: string;
    check: boolean;
}): Promise<string[]> => {
    assertOptions(options, optionsSource);
    const resolved = resolveOptions(options satisfies NxPluginOptions);

    const loaded = await Promise.all(
        projects.map(async project => {
            const projectRoot = Path.join(root, project.root);
            const [projectJson, packageJson, present] = await Promise.all([
                readJsonIfPresent(Path.join(projectRoot, 'project.json')),
                readJsonIfPresent(Path.join(projectRoot, 'package.json')),
                Promise.all(
                    inferencePaths.map(async path => isPresent(Path.join(projectRoot, path)))
                ),
            ]);
            return {
                ...project,
                present: new Set(inferencePaths.filter((_path, i) => present[i] === true)),
                projectJson: projectJson as JsonObject | undefined,
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

    const nxJsonPath = Path.join(root, 'nx.json');
    const nxJson = (await readJson(nxJsonPath)) as JsonObject;
    const files = [
        { path: nxJsonPath, current: nxJson, updated: updateNxJson(nxJson, resolved) },
        ...loaded
            .filter(({ projectJson }) => projectJson !== undefined)
            .map(({ packageJson, present, projectJson, root: projectRoot }) => {
                const inferred = inferTargets(
                    {
                        packageJson,
                        root: projectRoot,
                        isDependency:
                            packageJson?.name !== undefined && dependencies.has(packageJson.name),
                        has: path => present.has(path),
                    },
                    resolved
                );
                return {
                    path: Path.join(root, projectRoot, 'project.json'),
                    current: projectJson!,
                    updated: updateProjectJson(projectJson!, inferred, resolved),
                };
            }),
    ];

    const outdated = files.filter(
        // Key order counts too, so a reordered file is rewritten
        ({ current, updated }) => JSON.stringify(current) !== JSON.stringify(updated)
    );
    if (check && outdated.length > 0) {
        throw new Error(
            [
                'Not up to date with @leyman/nx-plugin; run its targets executor:',
                ...outdated.map(({ path }) => `- ${Path.relative(root, path)}`),
            ].join('\n')
        );
    }
    await Promise.all(
        outdated.map(async ({ path, updated }) =>
            writeFile(path, `${JSON.stringify(updated, null, 2)}\n`)
        )
    );
    return outdated.map(({ path }) => path);
};

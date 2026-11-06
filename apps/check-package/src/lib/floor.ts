import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import semver from 'semver';
import { findInstalled, isPresent } from './installed.js';

/**
 * The fields of `package.json` the floor checks read.
 */
export interface FloorPackageJson {
    engines?: { node?: string };
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

/**
 * Whether `tsconfig.json` extends the support floor's config.
 *
 * @param params - the package, the workspace root, the config template and the floor
 * @param params.cwd - the package directory
 * @param params.engine - the package's `engines.node` range
 * @param params.floor - the floor's major version
 * @param params.floorTsconfig - the config, with `{major}` for the floor: a package specifier, matched as is, or a
 * path relative to `root` starting with `./` or `../`
 * @param params.root - the workspace root
 * @returns the problem, if any
 */
const tsconfigProblem = async ({
    cwd,
    engine,
    floor,
    floorTsconfig,
    root,
}: {
    cwd: string;
    engine: string;
    floor: string;
    floorTsconfig: string;
    root: string;
}): Promise<string | null> => {
    const config = floorTsconfig.replaceAll('{major}', () => floor);
    const expected = /^\.\.?\//v.test(config)
        ? Path.relative(cwd, Path.join(root, config)).replaceAll(Path.sep, '/')
        : config;
    const tsconfigPath = Path.join(cwd, 'tsconfig.json');
    const extended = (await isPresent(tsconfigPath))
        ? ((await readJson(tsconfigPath)) as { extends?: unknown }).extends
        : undefined;
    if (extended === expected) {
        return null;
    }
    const described = extended === undefined ? 'nothing' : JSON.stringify(extended);
    return `tsconfig.json: extends ${described}, but engines.node "${engine}" needs "${expected}".`;
};

/**
 * Whether the installed `@types/node` matches the floor, so source can't use a newer API.
 *
 * @param cwd - the package directory
 * @param engine - the package's `engines.node` range
 * @param floor - the support floor: the major version `engines.node` starts at
 * @returns the problem, if any
 */
const typesProblem = async (cwd: string, engine: string, floor: string): Promise<string | null> => {
    const typesPath = await findInstalled(cwd, '@types/node/package.json');
    if (typesPath === null) {
        return null;
    }
    const { version } = (await readJson(typesPath)) as { version: string };
    return semver.major(version) === Number(floor)
        ? null
        : `@types/node: ${version} is installed, but engines.node "${engine}" needs @types/node ${floor}, so source can't use a newer API.`;
};

/**
 * Whether a runtime dependency supports the oldest Node.js the package's `engines.node` allows.
 *
 * @param cwd - the package directory
 * @param engine - the package's `engines.node` range
 * @param name - which dependency, as `package.json` names it
 * @returns the problem, if any
 */
const dependencyProblem = async (
    cwd: string,
    engine: string,
    name: string
): Promise<string | null> => {
    const dependencyPath = await findInstalled(cwd, `${name}/package.json`);
    if (dependencyPath === null) {
        return `engines.node: ${name} is not installed, so its engines can't be checked.`;
    }
    const dependencyEngine = ((await readJson(dependencyPath)) as FloorPackageJson).engines?.node;
    const oldest = semver.minVersion(engine)!;
    return dependencyEngine === undefined || semver.satisfies(oldest, dependencyEngine)
        ? null
        : `engines.node: "${engine}" allows Node.js ${oldest.version}, which ${name} doesn't support ("${dependencyEngine}"). Raise the floor to match.`;
};

/**
 * Checks the package's support floor, the major version of `engines.node`: that it names one, that
 * the installed `@types/node` matches it, optionally that `tsconfig.json` extends the floor's config,
 * and that every runtime dependency supports the oldest Node.js the package's `engines.node` allows.
 *
 * @param params - the package, its `package.json`, the workspace root and the config template
 * @param params.cwd - the package directory
 * @param params.floorTsconfig - the config `tsconfig.json` must extend, with `{major}` for the floor: a package
 * specifier, or a path relative to `root` starting with `./` or `../`
 * @param params.packageJson - the `engines` and dependencies, from `package.json`
 * @param params.root - the workspace root
 * @returns each problem found
 */
export const floorProblems = async ({
    cwd,
    floorTsconfig,
    packageJson,
    root,
}: {
    cwd: string;
    floorTsconfig: string | undefined;
    packageJson: FloorPackageJson;
    root: string;
}): Promise<string[]> => {
    const engine = packageJson.engines?.node;
    if (engine === undefined) {
        return [
            'engines.node: missing. Add ">=<version>", the oldest Node.js the package supports.',
        ];
    }
    const floor = /^>=\s*(?<major>\d+)/v.exec(engine)?.groups?.major;
    if (floor === undefined) {
        return [`engines.node: "${engine}" names no floor. Use ">=<version>".`];
    }

    const runtimeDependencies = [
        ...new Set(
            [
                packageJson.dependencies,
                packageJson.peerDependencies,
                packageJson.optionalDependencies,
            ].flatMap(dependencies => Object.keys(dependencies ?? {}))
        ),
    ].toSorted((a, b) => a.localeCompare(b, 'en'));
    const problems = await Promise.all([
        floorTsconfig === undefined
            ? null
            : tsconfigProblem({ cwd, engine, floor, floorTsconfig, root }),
        typesProblem(cwd, engine, floor),
        ...runtimeDependencies.map(async name => dependencyProblem(cwd, engine, name)),
    ]);
    return problems.filter(problem => problem !== null);
};

import { stat } from 'node:fs/promises';
import Path from 'node:path';
import { readContentMappers } from './config.js';
import { TrustedTscError } from './error.js';
import { findManifest, findPackage, readGrants, readManifest } from './packages.js';

/**
 * A content mapper allowed to run.
 */
export interface TrustedMapper {
    readonly name: string;
    readonly version: string;
    /**
     * The package's directory, as TypeScript resolves it from the project.
     */
    readonly directory: string;
}

/**
 * How to run `tsc`: with `--runExternalCode` and Node's permission model when the project has content mappers,
 * unchanged otherwise.
 */
export interface TscPlan {
    /**
     * The project's tsconfig.
     */
    readonly configFile: string;
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly mappers: readonly TrustedMapper[];
}

/**
 * Node flags that change what the permission model allows. A mapper's `exec`, or `NODE_OPTIONS`, can't have them.
 */
const permissionFlag = /^--(?:allow-|experimental-permission|permission)/iv;

/**
 * The only environment variables `tsc`, and so each mapper, gets: where to find `node`, `tsc`'s colours, and the
 * settings of Go's runtime, which `tsc` is built on. Anything else, such as a token, never reaches a mapper.
 */
const keptEnv = [
    'COLORTERM',
    'FORCE_COLOR',
    'GOGC',
    'GOMAXPROCS',
    'GOMEMLIMIT',
    'NO_COLOR',
    'PATH',
    'TERM',
    'TMPDIR',
    'TZ',
] as const;

/**
 * Find the project's tsconfig from `tsc`'s arguments.
 *
 * @param args - `tsc`'s arguments
 * @param cwd - working directory
 * @returns path of the tsconfig
 * @rejects {TrustedTscError} for arguments it won't pass on, or if there is no tsconfig
 */
const findConfig = async (args: readonly string[], cwd: string): Promise<string> => {
    let project = '.';
    for (const [index, arg] of args.entries()) {
        const option = arg.toLowerCase();
        if (option === '--runexternalcode') {
            throw new TrustedTscError(
                'Pass trusted content mappers in package.json, not --runExternalCode.'
            );
        }
        if (option === '-b' || option === '--build') {
            throw new TrustedTscError(
                "--build isn't supported: run each project with -p, in dependency order."
            );
        }
        if (option !== '-p' && option !== '--project') {
            continue;
        }
        const value = args[index + 1];
        if (value === undefined) {
            throw new TrustedTscError(`${arg} needs a path.`);
        }
        project = value;
    }
    const path = Path.resolve(cwd, project);
    try {
        const stats = await stat(path);
        return stats.isDirectory() ? Path.join(path, 'tsconfig.json') : path;
    } catch {
        throw new TrustedTscError(`There is no tsconfig at ${path}.`);
    }
};

/**
 * The content mappers a project's nearest `package.json` trusts, in its `trustedContentMappers` field.
 *
 * @param projectDirectory - directory of the project's tsconfig
 * @returns names of the trusted packages
 * @rejects {TrustedTscError} if the field isn't an array of package names
 */
const readTrusted = async (projectDirectory: string): Promise<readonly string[]> => {
    const directory = await findManifest(projectDirectory);
    if (directory === null) {
        return [];
    }
    const { trustedContentMappers: trusted } = await readManifest(directory);
    if (trusted === undefined) {
        return [];
    }
    if (!Array.isArray(trusted) || trusted.some(name => typeof name !== 'string')) {
        throw new TrustedTscError(
            `trustedContentMappers in ${Path.join(directory, 'package.json')} must be an array of package names.`
        );
    }
    return trusted as readonly string[];
};

/**
 * Check every content mapper of a project is trusted and can run in Node's permission model, and say how to run
 * `tsc` with them.
 *
 * Each mapper must be named in the `trustedContentMappers` of the project's nearest `package.json`, installed, and
 * run by `node`. The mappers may read their own packages and their dependencies, and nothing else: not the project,
 * other files, or (with no grant) child processes and workers. `tsc` runs with only a few environment variables,
 * which it passes on to the mappers. Node can't restrict the network.
 *
 * @param args - arguments for `tsc`
 * @param cwd - working directory, where `tsc` runs
 * @param env - environment `tsc` runs with
 * @returns `tsc`'s arguments and environment
 * @rejects {TrustedTscError} if a mapper isn't trusted or can't be sandboxed, or the project can't be read
 */
export const planTsc = async (
    args: readonly string[],
    cwd: string,
    env: Readonly<Record<string, string | undefined>>
): Promise<TscPlan> => {
    const configFile = await findConfig(args, cwd);
    const contentMappers = (await readContentMappers(configFile)) ?? [];
    if (!Array.isArray(contentMappers)) {
        throw new TrustedTscError(`contentMappers in ${configFile} must be an array.`);
    }
    if (contentMappers.length === 0) {
        return { configFile, args, env, mappers: [] };
    }
    const projectDirectory = Path.dirname(configFile);
    const trusted = await readTrusted(projectDirectory);
    const mappers: TrustedMapper[] = [];
    const grants = new Set<string>();
    for (const entry of contentMappers as unknown[]) {
        const name = (entry as { package?: unknown } | null)?.package;
        if (typeof name !== 'string') {
            throw new TrustedTscError(`Each of contentMappers in ${configFile} needs a package.`);
        }
        if (!trusted.includes(name)) {
            throw new TrustedTscError(
                `Content mapper '${name}' isn't trusted: add it to trustedContentMappers in the package.json of ${projectDirectory}.`
            );
        }
        const directory = await findPackage(projectDirectory, name);
        if (directory === null) {
            throw new TrustedTscError(`Content mapper '${name}' isn't installed.`);
        }
        const manifest = await readManifest(directory);
        const exec = manifest.typescript?.contentMapper?.exec;
        if (!Array.isArray(exec) || exec[0] !== 'node') {
            throw new TrustedTscError(
                `Content mapper '${name}' isn't run by node, so it can't be sandboxed.`
            );
        }
        if (exec.some(arg => permissionFlag.test(String(arg)))) {
            throw new TrustedTscError(
                `Content mapper '${name}' sets Node's permissions in its exec, which would replace the sandbox's.`
            );
        }
        const mapperGrants = await readGrants(directory);
        for (const grant of mapperGrants) {
            grants.add(grant);
        }
        mappers.push({ name, directory, version: manifest.version ?? '' });
    }
    const nodeOptions = env.NODE_OPTIONS ?? '';
    if (nodeOptions.split(/\s+/v).some(option => permissionFlag.test(option))) {
        throw new TrustedTscError(
            "NODE_OPTIONS sets Node's permissions, which would replace the sandbox's."
        );
    }
    const sandbox = [
        '--permission',
        ...[...grants]
            .toSorted((a, b) => a.localeCompare(b))
            .map(grant => `--allow-fs-read=${JSON.stringify(grant)}`),
    ];
    return {
        configFile,
        mappers,
        args: [...args, '--runExternalCode'],
        env: {
            ...Object.fromEntries(
                keptEnv.filter(name => env[name] !== undefined).map(name => [name, env[name]])
            ),
            NODE_OPTIONS: [nodeOptions, ...sandbox].join(' ').trim(),
        },
    };
};

import Path from 'node:path';
import { CheckPackageRootError } from './errors.js';
import { ancestors, isPresent } from './installed.js';

/**
 * The package managers whose `pack --json` output is understood.
 */
export const packManagers = ['npm', 'pnpm'] as const;
export type PackWith = (typeof packManagers)[number];

/**
 * Lockfiles that mark a workspace root, and the package manager each one implies, if supported.
 */
const lockfiles: readonly (readonly [string, PackWith | null])[] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['npm-shrinkwrap.json', 'npm'],
    ['yarn.lock', null],
    ['bun.lock', null],
    ['bun.lockb', null],
];

/**
 * The lockfile in a directory, if any.
 *
 * @param directory - absolute directory
 * @returns the package manager the lockfile implies, `null` for an unsupported one, or `undefined`
 * without a lockfile
 */
const lockfileIn = async (directory: string): Promise<PackWith | null | undefined> => {
    const found = await Promise.all(
        lockfiles.map(async ([lockfile]) => isPresent(Path.join(directory, lockfile)))
    );
    return lockfiles[found.indexOf(true)]?.[1];
};

/**
 * The workspace root and the package manager to pack with. Each defaults to the nearest directory
 * with a lockfile, from the package up, and the package manager that lockfile belongs to.
 *
 * @param params - the package directory, and the root and package manager if given
 * @param params.cwd - the package directory
 * @param params.root - the workspace root, if given
 * @param params.packWith - the package manager, if given
 * @returns the root and package manager
 * @rejects {CheckPackageRootError} when no root is found, the package isn't inside it, or the
 * package manager can't be told from the lockfile
 */
export const resolveRoot = async ({
    cwd,
    packWith,
    root,
}: {
    cwd: string;
    packWith: PackWith | undefined;
    root: string | undefined;
}): Promise<{ packWith: PackWith; root: string }> => {
    let resolvedRoot = root;
    if (resolvedRoot === undefined) {
        const directories = ancestors(cwd);
        const found = await Promise.all(directories.map(async directory => lockfileIn(directory)));
        resolvedRoot = directories[found.findIndex(lockfile => lockfile !== undefined)];
    }
    if (resolvedRoot === undefined) {
        throw new CheckPackageRootError(
            `No lockfile found in ${cwd} or above it. Pass the workspace root (--root) and the package manager (--pack-with).`
        );
    }
    if (Path.relative(resolvedRoot, cwd).startsWith('..')) {
        throw new CheckPackageRootError(`${cwd} is not inside the workspace root ${resolvedRoot}.`);
    }
    const resolvedPackWith = packWith ?? (await lockfileIn(resolvedRoot));
    if (resolvedPackWith === null || resolvedPackWith === undefined) {
        throw new CheckPackageRootError(
            `Can't tell which package manager to pack with from ${resolvedRoot}. Pass --pack-with (${packManagers.join(' or ')}).`
        );
    }
    return { packWith: resolvedPackWith, root: resolvedRoot };
};

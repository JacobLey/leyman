import { npmPackages } from './lib/npm-packages.js';
import { rushPackages } from './lib/rush-packages.js';
import type { PackageMeta } from './lib/types.js';

export type { PackageMeta };
export type PackageManager = 'npm' | 'rush' | 'yarn';

const managerAllowed = (
    check: PackageManager,
    manager: PackageManager | undefined
): boolean => (manager ?? check) === check;

/**
 * List all packages in a monorepo.
 *
 * Will try multiple managers unless one is chosen specifically.
 *
 * Note `manager` means what tool is used as the source of truth of all packages in monorepo.
 * e.g. A rush monorepo can use `npm` for actual package management, but projects are listed in `rush.json`.
 *
 * @param {object} [options] - options
 * @param {string} [options.cwd] - where to start looking for manager-specific files
 * @param {string} [options.manager] - what package manager to use (otherwise all are tried)
 * @returns {Promise<object[]>} list of found packages
 * @throws when no packages can be found
 */
export const listPackages = async (
    {
        cwd,
        manager,
    }: {
        cwd?: string;
        manager?: PackageManager | undefined;
    } = {}
): Promise<PackageMeta[]> => {

    let packagePaths: PackageMeta[] | null = null;

    if (managerAllowed('npm', manager) || managerAllowed('yarn', manager)) {
        packagePaths = await npmPackages({ cwd });
        if (packagePaths) {
            return packagePaths;
        }
    }
    if (managerAllowed('rush', manager)) {
        packagePaths = await rushPackages({ cwd });
        if (packagePaths) {
            return packagePaths;
        }
    }

    throw new Error('Unable to find packages');
};

import { access } from 'node:fs/promises';
import Path from 'node:path';

/**
 * Whether a path exists.
 *
 * @param path - absolute path
 * @returns `true` when something is there
 */
export const isPresent = async (path: string): Promise<boolean> => {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
};

/**
 * Each directory from `start` up to the filesystem root, nearest first.
 *
 * @param start - absolute directory
 * @returns `start` and its ancestors
 */
export const ancestors = (start: string): string[] => {
    const directories = [start];
    let directory = start;
    let parent = Path.dirname(directory);
    while (parent !== directory) {
        directories.push(parent);
        directory = parent;
        parent = Path.dirname(directory);
    }
    return directories;
};

/**
 * Finds a path inside `node_modules` the way Node.js and TypeScript resolve a package: in the nearest
 * `node_modules` that has it, from `cwd` up.
 *
 * @param cwd - directory to resolve from
 * @param relativePath - path inside `node_modules`, e.g. `@types/node/package.json` or `.bin/tsc`
 * @returns the absolute path, or `null` if no `node_modules` has it
 */
export const findInstalled = async (cwd: string, relativePath: string): Promise<string | null> => {
    const candidates = ancestors(cwd).map(directory =>
        Path.join(directory, 'node_modules', relativePath)
    );
    const found = await Promise.all(candidates.map(async candidate => isPresent(candidate)));
    return candidates[found.indexOf(true)] ?? null;
};

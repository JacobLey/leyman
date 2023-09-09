import { stat } from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Directory = string | URL | null | undefined;

/**
 * Parse `cwd` from optional relative path or URL.
 * Resolves relative to `process.cwd()`.
 *
 * Validates that directory actually exists.
 *
 * @param {string|URL} cwd - path to resolve to cwd, optionally as an object { cwd: '/path...' }
 * @returns {Promise<string>} full path to cwd
 */
export const parseCwd = async (
    cwd?: Directory | { cwd?: Directory }
): Promise<string> => {

    let rawCwd: Directory;

    if (typeof cwd === 'string' || cwd instanceof URL) {
        rawCwd = cwd;
    } else if (cwd) {
        rawCwd = cwd.cwd;
    }

    if (rawCwd === null || rawCwd === undefined) {
        return process.cwd();
    }

    const directory = rawCwd instanceof URL || rawCwd.startsWith('file://') ?
        fileURLToPath(rawCwd) :
        Path.resolve(rawCwd);

    try {
        const stats = await stat(directory);
        return stats.isDirectory() ? directory : Path.dirname(directory);
    } catch {
        throw new Error(`Directory not found: ${directory}`);
    }
};

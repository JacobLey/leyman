import { readFile } from 'node:fs/promises';
import { findPackageJSON } from 'node:module';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Returns true if the given file has a package.json that _explicitly_ sets `"type": "module"`.
 *
 * Uses the same package scope lookup as Node, so a malformed nearest package.json throws.
 *
 * @param file - filename
 * @returns true if module
 */
export const isExplicitlyModuleDirectory = async (file: string): Promise<boolean> => {
    const packageJsonPath = findPackageJSON(pathToFileURL(file));

    // Since Node 24.14, a file without any package.json above it resolves to itself
    if (!packageJsonPath || Path.basename(packageJsonPath) !== 'package.json') {
        return false;
    }

    const packageJson: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    return (
        typeof packageJson === 'object' &&
        packageJson !== null &&
        'type' in packageJson &&
        packageJson.type === 'module'
    );
};

import { realpath } from 'node:fs/promises';
import Path from 'node:path';
import { TrustedTscError } from './error.js';
import { findManifest, findPackage, isPresent, readManifest } from './packages.js';

/**
 * The first TypeScript version with content mappers.
 */
// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- TypeScript 7.1
const contentMappersVersion = { major: 7, minor: 1 } as const;

/**
 * Whether a TypeScript version has content mappers.
 *
 * @param version - `typescript` package version
 * @returns `true` from 7.1 (including its pre-releases)
 */
const hasContentMappers = (version: string): boolean => {
    const [major = 0, minor = 0] = version.split('.').map(Number);
    return (
        major > contentMappersVersion.major ||
        (major === contentMappersVersion.major && minor >= contentMappersVersion.minor)
    );
};

/**
 * Find the executable of an installed `typescript` package: in its platform's package, as TypeScript's `tsc` script
 * finds it.
 *
 * @param typescriptDirectory - directory of the `typescript` package
 * @param version - its version
 * @returns path of the executable
 * @rejects {TrustedTscError} if the platform's package, or its executable, isn't installed
 */
const findExecutable = async (typescriptDirectory: string, version: string): Promise<string> => {
    const platform = `@typescript/typescript-${process.platform}-${process.arch}`;
    const platformPackage = await findPackage(await realpath(typescriptDirectory), platform);
    if (platformPackage !== null) {
        const exe = Path.join(platformPackage, 'lib', 'tsc');
        if (await isPresent(exe)) {
            return exe;
        }
    }
    throw new TrustedTscError(`TypeScript ${version}'s executable isn't installed (${platform}).`);
};

/**
 * Find the native `tsc` executable of TypeScript 7.1 or later, installed for a project.
 *
 * The `tsc` command is a Node script that starts the executable, so running it would put the script in the sandbox
 * too. Look for a dependency of the project's nearest `package.json` that is the `typescript` package, under any
 * name (such as an alias).
 *
 * @param projectDirectory - directory of the project's tsconfig
 * @returns path of the executable
 * @rejects {TrustedTscError} if TypeScript 7.1 or later, or its executable, isn't installed
 */
export const findTsc = async (projectDirectory: string): Promise<string> => {
    const manifestDirectory = await findManifest(projectDirectory);
    if (manifestDirectory !== null) {
        const { dependencies, devDependencies } = await readManifest(manifestDirectory);
        const names = Object.keys({ ...dependencies, ...devDependencies });
        for (const name of names) {
            const found = await findPackage(manifestDirectory, name);
            if (found === null) {
                continue;
            }
            const { name: packageName, version = '' } = await readManifest(found);
            if (packageName === 'typescript' && hasContentMappers(version)) {
                return findExecutable(found, version);
            }
        }
    }
    throw new TrustedTscError(
        `TypeScript 7.1 or later isn't a dependency of the package of ${projectDirectory}.`
    );
};

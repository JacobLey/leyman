import { access, lstat, readFile, readlink, realpath } from 'node:fs/promises';
import Path from 'node:path';

/**
 * The fields of a `package.json` this package reads.
 */
export interface Manifest {
    readonly name?: string;
    readonly version?: string;
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
    readonly peerDependencies?: Readonly<Record<string, string>>;
    readonly trustedContentMappers?: unknown;
    readonly typescript?: { readonly contentMapper?: { readonly exec?: unknown } };
}

/**
 * Whether a file exists.
 *
 * @param path - path to check
 * @returns `true` if it exists
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
 * Read a `package.json`.
 *
 * @param directory - directory of the `package.json`
 * @returns its manifest
 */
export const readManifest = async (directory: string): Promise<Manifest> =>
    JSON.parse(await readFile(Path.join(directory, 'package.json'), 'utf8')) as Manifest;

/**
 * Find an installed package the way Node and TypeScript do: in `node_modules`, from a directory up to the root.
 *
 * @param from - directory to start from
 * @param name - name to look for, with any scope
 * @returns the package's directory, as found (symbolic links unresolved), or `null` if it isn't installed
 */
export const findPackage = async (from: string, name: string): Promise<string | null> => {
    const found = Path.join(from, 'node_modules', name);
    if (await isPresent(Path.join(found, 'package.json'))) {
        return found;
    }
    const parent = Path.dirname(from);
    return parent === from ? null : findPackage(parent, name);
};

/**
 * Find the `package.json` nearest a directory.
 *
 * @param from - directory to start from
 * @returns directory of the nearest `package.json`, or `null` if there is none
 */
export const findManifest = async (from: string): Promise<string | null> => {
    if (await isPresent(Path.join(from, 'package.json'))) {
        return from;
    }
    const parent = Path.dirname(from);
    return parent === from ? null : findManifest(parent);
};

/**
 * The directories a Node program needs to read to load a package and its dependencies: each package's real
 * directory, and, for a dependency installed as a symbolic link (as pnpm does), the directory holding the link, and
 * that of each link it leads through. Node resolves links in its permission grants, so a link is only readable
 * through its parent.
 *
 * @param directory - the package's directory
 * @returns directories to grant read access to
 */
export const readGrants = async (directory: string): Promise<Set<string>> => {
    const grants = new Set<string>();
    const grantLinks = async (path: string): Promise<void> => {
        const stats = await lstat(path);
        if (!stats.isSymbolicLink()) {
            return;
        }
        grants.add(await realpath(Path.dirname(path)));
        await grantLinks(Path.resolve(Path.dirname(path), await readlink(path)));
    };
    const visit = async (found: string): Promise<void> => {
        await grantLinks(found);
        const real = await realpath(found);
        if (grants.has(real)) {
            return;
        }
        grants.add(real);
        const manifest = await readManifest(real);
        const names = Object.keys({
            ...manifest.dependencies,
            ...manifest.optionalDependencies,
            ...manifest.peerDependencies,
        });
        for (const name of names) {
            const dependency = await findPackage(real, name);
            // Optional and peer dependencies may be missing, and Node can't load a missing one anyway
            if (dependency !== null) {
                await visit(dependency);
            }
        }
    };
    await visit(await realpath(directory));
    return grants;
};

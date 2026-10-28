import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import Path from 'node:path';
import { TrustedTscError } from './error.js';
import { parseJsonc } from './jsonc.js';
import { isPresent } from './packages.js';

/**
 * Find the file a tsconfig's `extends` names, as TypeScript does.
 *
 * @param specifier - an `extends` entry: a path, or a package with an optional path inside it
 * @param configFile - the tsconfig it is in
 * @returns path of the extended tsconfig
 * @rejects {TrustedTscError} if a package's tsconfig can't be found
 */
const resolveExtends = async (specifier: string, configFile: string): Promise<string> => {
    if (specifier.startsWith('.') || Path.isAbsolute(specifier)) {
        const path = Path.resolve(Path.dirname(configFile), specifier);
        return path.endsWith('.json') || (await isPresent(path)) ? path : `${path}.json`;
    }
    const name = /^(?:@[^\/]+\/)?[^\/]+/v.exec(specifier)![0];
    const candidates =
        name === specifier ? [`${specifier}/tsconfig.json`] : [specifier, `${specifier}.json`];
    const require = createRequire(configFile);
    for (const candidate of candidates) {
        try {
            return require.resolve(candidate);
        } catch {
            // Try the next candidate
        }
    }
    throw new TrustedTscError(`Can't find '${specifier}', which ${configFile} extends.`);
};

/**
 * Read a tsconfig's `contentMappers`, following `extends` as TypeScript does: a tsconfig's own list replaces
 * any it inherits, and otherwise it has the list of the last config it extends that has one.
 *
 * @param configFile - path of the tsconfig
 * @param extendedBy - tsconfigs that (transitively) extend this one, to catch a cycle
 * @returns the `contentMappers` value, unvalidated, or `undefined` if no config sets it
 * @rejects {TrustedTscError} if a tsconfig can't be read, or extends itself
 */
export const readContentMappers = async (
    configFile: string,
    extendedBy: readonly string[] = []
): Promise<unknown> => {
    if (extendedBy.includes(configFile)) {
        throw new TrustedTscError(`${configFile} extends itself.`);
    }
    let config: { readonly contentMappers?: unknown; readonly extends?: unknown };
    try {
        config = parseJsonc(await readFile(configFile, 'utf8')) as typeof config;
    } catch (error) {
        throw new TrustedTscError(`Can't read ${configFile}: ${(error as Error).message}`);
    }
    if (Object.hasOwn(config, 'contentMappers')) {
        return config.contentMappers;
    }
    let contentMappers: unknown;
    for (const specifier of [config.extends ?? []].flat() as string[]) {
        const inherited = await readContentMappers(await resolveExtends(specifier, configFile), [
            ...extendedBy,
            configFile,
        ]);
        if (inherited !== undefined) {
            contentMappers = inherited;
        }
    }
    return contentMappers;
};

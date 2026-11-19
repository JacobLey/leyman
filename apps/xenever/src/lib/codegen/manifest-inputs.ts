import type { ManifestInputs } from 'generated-signature';
import Path from 'node:path';
import { contentHash } from 'generated-signature';

/**
 * Options that change what `xeneverFile` writes, besides its inputs' content.
 */
export interface OutputOptions {
    readonly bigint: boolean;
    readonly catalog: Readonly<Record<string, string>>;
    readonly ordered: readonly string[];
    readonly signed: boolean;
    readonly unsafeIgnoreDerivedTypes: boolean;
}

/**
 * Inputs to record in the output's manifest entry: the generator's version, a hash of the options, and a hash of
 * every file read, by its path relative to the manifest (starting with `.`, so it can't be confused with
 * `generator` or `options`).
 *
 * @param params - what produced the output
 * @param params.manifestPath - absolute path of the manifest
 * @param params.options - options that change the output, defaults resolved
 * @param params.sources - text of every file read, by absolute path
 * @returns manifest inputs
 */
export const recordInputs = async ({
    manifestPath,
    options,
    sources,
}: {
    readonly manifestPath: string;
    readonly options: OutputOptions;
    readonly sources: ReadonlyMap<string, string>;
}): Promise<ManifestInputs> => {
    // eslint-disable-next-line import-x/no-relative-parent-imports -- The build is two levels below package.json
    const { default: packageJson } = await import('../../../package.json', {
        with: { type: 'json' },
    });
    const dir = Path.dirname(manifestPath);
    return {
        generator: `xenever@${packageJson.version}`,
        options: contentHash(JSON.stringify(options)),
        ...Object.fromEntries(
            sources.entries().map(([path, text]) => {
                const relative = Path.relative(dir, path).replaceAll(Path.sep, '/');
                return [relative.startsWith('../') ? relative : `./${relative}`, contentHash(text)];
            })
        ),
    };
};

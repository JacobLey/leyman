import type { Manifest, ManifestInputs } from 'generated-signature';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, parseManifest, verifyManifestEntry } from 'generated-signature';
import { defaultTypedMinItems } from './convert.js';

/**
 * What, besides its inputs' content, decides the output.
 */
export interface GeneratorIdentity {
    /**
     * `genever@<version>`.
     */
    readonly generator: string;
    /**
     * Hash of the options that change the output.
     */
    readonly options: string;
}

export const generatorIdentity = async (options: {
    readonly name?: string | undefined;
    readonly openApi30?: boolean | undefined;
    readonly parameterDefaults?: boolean | undefined;
    readonly signed?: boolean | undefined;
    readonly strict?: boolean | undefined;
    readonly typedMinItems?: number | undefined;
}): Promise<GeneratorIdentity> => {
    // eslint-disable-next-line import-x/no-relative-parent-imports -- as in cli.ts
    const { default: packageJson } = await import('../../package.json', {
        with: { type: 'json' },
    });
    // Defaults resolved, so the API and the CLI (which passes them explicitly) agree
    const resolved = {
        name: options.name ?? 'Schema',
        openApi30: options.openApi30 ?? false,
        parameterDefaults: options.parameterDefaults ?? false,
        signed: options.signed ?? false,
        strict: options.strict ?? true,
        typedMinItems: options.typedMinItems ?? defaultTypedMinItems,
    };
    return {
        generator: `genever@${packageJson.version}`,
        options: contentHash(JSON.stringify(resolved)),
    };
};

/**
 * Manifest key of an input: a file's path relative to the manifest, starting with `.` so it can't
 * be confused with `generator` or `options`, or a URL as is.
 *
 * @param manifestDir - directory of the manifest
 * @param uri - URI the input was read from
 * @returns `./`- or `../`-relative path for a file, the URL otherwise
 */
const inputKey = (manifestDir: string, uri: string): string => {
    if (!uri.startsWith('file:')) {
        return uri;
    }
    const relative = Path.relative(manifestDir, fileURLToPath(uri)).replaceAll(Path.sep, '/');
    return relative.startsWith('../') ? relative : `./${relative}`;
};

/**
 * Inputs to record in the output's manifest entry.
 *
 * @param params - what produced the output
 * @param params.manifestPath - absolute path of the manifest
 * @param params.identity - generator version and options
 * @param params.sources - text of every file and URL read, by URI
 * @returns manifest inputs
 */
export const recordInputs = ({
    manifestPath,
    identity,
    sources,
}: {
    manifestPath: string;
    identity: GeneratorIdentity;
    sources: ReadonlyMap<string, string>;
}): ManifestInputs => {
    const dir = Path.dirname(manifestPath);
    return {
        ...identity,
        ...Object.fromEntries(
            sources.entries().map(([uri, text]) => [inputKey(dir, uri), contentHash(text)])
        ),
    };
};

const readIfExists = async (filePath: string): Promise<string | null> => {
    try {
        return await readFile(filePath, 'utf8');
    } catch {
        return null;
    }
};

/**
 * Whether the output is up to date according to its manifest entry, without regenerating it or
 * fetching anything: same generator and options, output unedited, and every input *file* unchanged.
 * Remote URLs are trusted as recorded, and only re-fetched when generating.
 *
 * Any doubt (no manifest, no entry, an unreadable file) answers false, so the caller does a full
 * check instead, which explains what is out of date.
 *
 * @param params - what to check
 * @param params.manifestPath - absolute path of the manifest
 * @param params.output - absolute path of the output
 * @param params.identity - current generator version and options
 * @returns true if known to be up to date
 */
export const isUpToDate = async ({
    manifestPath,
    output,
    identity,
}: {
    manifestPath: string;
    output: string;
    identity: GeneratorIdentity;
}): Promise<boolean> => {
    const [manifestText, outputText] = await Promise.all([
        readIfExists(manifestPath),
        readIfExists(output),
    ]);
    if (manifestText === null || outputText === null) {
        return false;
    }
    const dir = Path.dirname(manifestPath);
    let files: Manifest['files'];
    try {
        ({ files } = parseManifest(manifestText));
    } catch {
        return false;
    }
    // Keyed like populate-files writes it
    const entry = files[Path.relative(dir, output).replaceAll(Path.sep, '/')];
    if (
        entry?.inputs?.generator !== identity.generator ||
        entry.inputs.options !== identity.options ||
        verifyManifestEntry(outputText, entry).status !== 'valid'
    ) {
        return false;
    }
    const { inputs } = entry;
    const inputFiles = Object.entries(inputs).filter(([key]) => key.startsWith('.'));
    const current = await Promise.all(
        inputFiles.map(async ([key]) => readIfExists(Path.resolve(dir, key)))
    );
    return inputFiles.every(
        ([, hash], i) => current[i] !== null && contentHash(current[i]!) === hash
    );
};

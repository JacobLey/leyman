import type { Directory } from 'parse-cwd';
import type { LoadXsdOptions } from '#internal/lib/xsd/load.js';
import Path from 'node:path';
import { formatText } from 'format-file';
import { parseCwd } from 'parse-cwd';
import { populateFile } from 'populate-files';
import { loadXsd } from '#internal/lib/xsd/load.js';
import { generate } from './generate.js';
import { recordInputs } from './manifest-inputs.js';

/**
 * @import { XeneverLoadError, XeneverSchemaError } from '#internal/lib/errors.js'
 * @import { PopulateFilesCheckError, PopulateFilesOwnershipError } from 'populate-files'
 */

/**
 * Options for {@link xeneverFile}.
 */
export interface XeneverFileOptions
    extends Pick<LoadXsdOptions, 'bigint' | 'ordered' | 'unsafeIgnoreDerivedTypes'> {
    /**
     * Local paths of schemas, by the `schemaLocation` of an include or import as written, or by the namespace
     * of an import (see `loadXsd`). Paths are relative to `cwd`.
     */
    readonly catalog?: Readonly<Record<string, string>>;
    /**
     * Fail, rather than write, if the output file is not up to date.
     *
     * @default false
     */
    readonly check?: boolean;
    /**
     * Directory that relative paths resolve from.
     *
     * @default process.cwd()
     */
    readonly cwd?: Directory;
    /**
     * Do not write the output file.
     *
     * @default false
     */
    readonly dryRun?: boolean;
    /**
     * With `signed` or `manifest`, overwrite the output file even if it was edited, or is not signed or listed
     * yet.
     *
     * @default false
     */
    readonly force?: boolean;
    /**
     * Sign the output file with `generated-signature`, so edits to it are detected, and refuse to overwrite a
     * file that was edited or is not signed (unless `force`).
     *
     * @default false
     */
    readonly signed?: boolean;
    /**
     * Path of a manifest (relative to `cwd`) to record the output in, with hashes of its inputs: every XSD read,
     * xenever's version and the options. See populate-files' `manifest`.
     */
    readonly manifest?: string;
    /**
     * Path of the TypeScript file to write, relative to `cwd`.
     *
     * @default the input path, with a `.ts` extension instead of `.xsd`
     */
    readonly output?: string;
}

/**
 * Generates a TypeScript file from an XSD and the files it includes and imports (see `generate`), formatted
 * with the project's formatter.
 *
 * @param input - path of the XSD, relative to `cwd`
 * @param [options] - optional, see {@link XeneverFileOptions}
 * @returns path of the output file, and whether it changed
 * @throws {XeneverSchemaError} if a schema is invalid, or uses a construct xenever doesn't support
 * @throws {XeneverLoadError} if a file can't be read, or a `schemaLocation` is a URL without a catalog entry
 * @throws {TypeError} if `ordered` names something other than a complex type with child elements
 * @throws {PopulateFilesCheckError} with `check`, if the output file is not up to date
 * @throws {PopulateFilesOwnershipError} with `signed` or `manifest`, if the output file was edited or is not
 * signed or listed
 */
export const xeneverFile = async (
    input: string,
    options: XeneverFileOptions = {}
): Promise<{ output: string; updated: boolean }> => {
    const cwd = await parseCwd(options.cwd ?? null);
    const inputPath = Path.resolve(cwd, input);
    const output = Path.resolve(cwd, options.output ?? `${inputPath.replace(/\.xsd$/iv, '')}.ts`);
    const catalog = Object.fromEntries(
        Object.entries(options.catalog ?? {}).map(([location, path]) => [
            location,
            Path.resolve(cwd, path),
        ])
    );
    const sources = new Map<string, string>();
    const set = await loadXsd(inputPath, {
        catalog,
        bigint: options.bigint ?? false,
        ordered: options.ordered ?? [],
        unsafeIgnoreDerivedTypes: options.unsafeIgnoreDerivedTypes ?? false,
        onRead: (path, text) => {
            sources.set(path, text);
        },
    });
    const content = await formatText(generate(set).text, { ext: '.ts' });

    const manifestPath =
        options.manifest === undefined ? null : Path.resolve(cwd, options.manifest);
    const manifestInputs =
        manifestPath === null
            ? {}
            : {
                  manifestInputs: await recordInputs({
                      manifestPath,
                      sources,
                      options: {
                          bigint: options.bigint ?? false,
                          catalog: options.catalog ?? {},
                          ordered: options.ordered ?? [],
                          signed: options.signed ?? false,
                          unsafeIgnoreDerivedTypes: options.unsafeIgnoreDerivedTypes ?? false,
                      },
                  }),
              };
    const { updated } = await populateFile(
        options.signed === true
            ? { content, filePath: output, signed: true, ...manifestInputs }
            : { content, filePath: output, ...manifestInputs },
        {
            check: options.check ?? false,
            dryRun: options.dryRun ?? false,
            force: options.force ?? false,
            manifest: manifestPath,
        }
    );
    return { output, updated };
};

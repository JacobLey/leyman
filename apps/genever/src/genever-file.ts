import type { Directory } from 'parse-cwd';
import type { GeneverOptions } from './genever.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatText } from 'format-file';
import { parseCwd } from 'parse-cwd';
import { populateFile } from 'populate-files';
import { genever } from './genever.js';
import { loadReferences } from './lib/load.js';
import { generatorIdentity, isUpToDate, recordInputs } from './lib/manifest-inputs.js';
import { openApiDialect } from './lib/openapi.js';
import { isYaml, parseText } from './lib/parse.js';

/**
 * @import { GeneverError, GeneverLoadError } from './lib/errors.js'
 * @import { PopulateFilesOwnershipError } from 'populate-files'
 * @import { YAMLError } from 'yaml'
 */

/**
 * Options for {@link geneverFile}.
 */
export interface GeneverFileOptions extends GeneverOptions {
    /**
     * Fail, rather than write, if the output file is not up to date.
     *
     * @default false
     */
    check?: boolean;
    /**
     * Directory that relative paths resolve from.
     *
     * @default process.cwd()
     */
    cwd?: Directory;
    /**
     * Load `http:` and `https:` URLs the schema references. Otherwise, only files are loaded.
     *
     * A list of hosts loads only URLs of those hosts, including where they redirect to.
     * A host matches on any port, unless it names one (`localhost:8080`), and `*.example.com`
     * matches subdomains of `example.com`, but not `example.com` itself.
     *
     * @default true
     */
    fetch?: boolean | readonly string[];
    /**
     * Do not write the output file.
     *
     * @default false
     */
    dryRun?: boolean;
    /**
     * With `signed`, overwrite the output file even if it was edited, or is not signed yet.
     *
     * @default false
     */
    force?: boolean;
    /**
     * Sign the output file with `generated-signature`, so edits to it are detected,
     * and refuse to overwrite a file that was edited or is not signed (unless `force`).
     *
     * @default false
     */
    signed?: boolean;
    /**
     * Path of a manifest (relative to `cwd`) to record the output in, with hashes of its inputs:
     * the files and URLs read, genever's version and the options. With `check`, an output whose
     * manifest entry still matches is up to date without loading anything, so remote URLs are
     * not fetched: they are only re-fetched when generating. See populate-files' `manifest`.
     */
    manifest?: string;
    /**
     * Path of the TypeScript file to write.
     *
     * @default the input path, with a `.ts` extension instead of `.json`, `.yaml` or `.yml`
     */
    output?: string;
}

/**
 * Generate a TypeScript file of types from a JSON Schema file, or OpenAPI document, in JSON or YAML.
 * Files and URLs it references are bundled into it first, so they become types in the same file.
 *
 * @param input - path to the JSON Schema file, or OpenAPI document. A `.yaml` or `.yml` file is read as YAML
 * @param [options] - optional, see {@link GeneverFileOptions}
 * @returns path of the output file, and whether it changed
 * @throws {GeneverError} if the schema is invalid, breaks a strict mode rule, or is not supported
 * @throws {GeneverLoadError} if a referenced file or URL can't be loaded
 * @throws {TypeError} if `fetch` lists something that is not a host
 * @throws {PopulateFilesOwnershipError} with `signed`, if the output file was edited or is not signed
 * @throws {SyntaxError | YAMLError} if the input can't be parsed
 */
export const geneverFile = async (
    input: string,
    options: GeneverFileOptions = {}
): Promise<{ output: string; updated: boolean }> => {
    const cwd = await parseCwd(options.cwd ?? null);
    const inputPath = Path.resolve(cwd, input);
    const output = Path.resolve(
        cwd,
        options.output ?? `${inputPath.replace(/\.(?:json|ya?ml)$/iv, '')}.ts`
    );

    const manifestPath =
        options.manifest === undefined ? null : Path.resolve(cwd, options.manifest);
    const identity = await generatorIdentity(options);
    if (
        manifestPath !== null &&
        options.check === true &&
        (await isUpToDate({ manifestPath, output, identity }))
    ) {
        return { output, updated: false };
    }

    const baseUri = pathToFileURL(inputPath).href;
    const inputText = await readFile(inputPath, 'utf8');
    const sources = new Map([[baseUri, inputText]]);
    const schema = parseText(inputText, isYaml(baseUri));
    const documentDialect = openApiDialect(schema);
    const bundled = await loadReferences(schema, {
        baseUri,
        fetch: options.fetch ?? true,
        isDocument: documentDialect !== null,
        onRead: (uri, text) => {
            sources.set(uri, text);
        },
    });
    const content = await formatText(genever(bundled, { ...options, baseUri }), { ext: '.ts' });

    const manifestInputs =
        manifestPath === null
            ? {}
            : { manifestInputs: recordInputs({ manifestPath, identity, sources }) };
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

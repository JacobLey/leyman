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
import { openApiDialect } from './lib/openapi.js';
import { isYaml, parseText } from './lib/parse.js';

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
        options.output ?? `${inputPath.replace(/\.(?:json|ya?ml)$/iu, '')}.ts`
    );

    const baseUri = pathToFileURL(inputPath).href;
    const schema = parseText(await readFile(inputPath, 'utf8'), isYaml(baseUri));
    const documentDialect = openApiDialect(schema);
    const bundled = await loadReferences(schema, {
        baseUri,
        fetch: options.fetch ?? true,
        isDocument: documentDialect !== null,
    });
    const content = await formatText(genever(bundled, { ...options, baseUri }), { ext: '.ts' });

    const { updated } = await populateFile(
        { filePath: output, content },
        { check: options.check ?? false, dryRun: options.dryRun ?? false }
    );
    return { output, updated };
};

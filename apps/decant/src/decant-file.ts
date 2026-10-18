import type { Directory } from 'parse-cwd';
import type { DecantOptions } from './decant.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatText } from 'format-file';
import { parseCwd } from 'parse-cwd';
import { populateFile } from 'populate-files';
import { decant } from './decant.js';
import { bundleReferences } from './lib/bundle.js';
import { openApiDialect } from './lib/openapi.js';

/**
 * Options for {@link decantFile}.
 */
export interface DecantFileOptions extends DecantOptions {
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
     * Do not write the output file.
     *
     * @default false
     */
    dryRun?: boolean;
    /**
     * Path of the TypeScript file to write.
     *
     * @default the input path, with a `.ts` extension instead of `.json`
     */
    output?: string;
}

/**
 * Generate a TypeScript file of types from a JSON Schema file.
 * Files and URLs it references are bundled into it first, so they become types in the same file.
 *
 * @param input - path to the JSON Schema file
 * @param [options] - optional, see {@link DecantFileOptions}
 * @returns path of the output file, and whether it changed
 * @throws {DecantError} if the schema is invalid, breaks a strict mode rule, or is not supported
 * @throws {DecantLoadError} if a referenced file or URL can't be loaded
 */
export const decantFile = async (
    input: string,
    options: DecantFileOptions = {}
): Promise<{ output: string; updated: boolean }> => {
    const cwd = await parseCwd(options.cwd ?? null);
    const inputPath = Path.resolve(cwd, input);
    const output = Path.resolve(
        cwd,
        options.output ??
            Path.join(Path.dirname(inputPath), `${Path.basename(inputPath, '.json')}.ts`)
    );

    const schema: unknown = JSON.parse(await readFile(inputPath, 'utf8'));
    const baseUri = pathToFileURL(inputPath).href;
    const documentDialect = openApiDialect(schema);
    const bundled = await bundleReferences(schema, {
        baseUri,
        dialect: documentDialect ?? (options.openApi30 ? 'openapi-3.0' : 'draft-2020-12'),
        isDocument: documentDialect !== null,
    });
    const content = await formatText(decant(bundled, { ...options, baseUri }), { ext: '.ts' });

    const { updated } = await populateFile(
        { filePath: output, content },
        { check: options.check ?? false, dryRun: options.dryRun ?? false }
    );
    return { output, updated };
};

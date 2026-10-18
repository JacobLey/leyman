import type { Directory } from 'parse-cwd';
import type { DecantOptions } from './decant.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { formatText } from 'format-file';
import { parseCwd } from 'parse-cwd';
import { populateFile } from 'populate-files';
import { decant } from './decant.js';

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
 *
 * @param input - path to the JSON Schema file
 * @param [options] - optional, see {@link DecantFileOptions}
 * @returns path of the output file, and whether it changed
 * @throws {DecantError} if the schema is invalid, breaks a strict mode rule, or is not supported
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
    const content = await formatText(decant(schema, options), { ext: '.ts' });

    const { updated } = await populateFile(
        { filePath: output, content },
        { check: options.check ?? false, dryRun: options.dryRun ?? false }
    );
    return { output, updated };
};

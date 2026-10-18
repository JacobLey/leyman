import type { Command, DecantCommandInput } from './lib/types.js';
import { isCI } from 'ci-info';
import { bind } from 'haywire';
import { decantFile } from '../decant-file.js';
import { defaultTypedMinItems } from '../lib/convert.js';
import { commandId } from './lib/types.js';

interface DecantCommandExtendedInput extends DecantCommandInput {
    ci: boolean;
    dryRun: boolean;
    input: string;
    name: string;
    openApi30: boolean;
    output: string | undefined;
    strict: boolean;
    typedMinItems: number;
}

/**
 * Main `decant` command
 */
export const decantCommand: Command<DecantCommandExtendedInput> = {
    command: '$0 <input>',
    describe:
        'Write TypeScript types for a JSON Schema file, or the schemas of an OpenAPI document',
    builder: yargs =>
        yargs
            .positional('input', {
                describe: 'Path to the JSON Schema file, or OpenAPI document',
                type: 'string',
                demandOption: true,
            })
            .options({
                output: {
                    alias: 'o',
                    describe:
                        'Path of the TypeScript file to write. Defaults to the input path, with a .ts extension',
                    type: 'string',
                },
                name: {
                    describe: 'Name of the root schema type. Not used for an OpenAPI document',
                    type: 'string',
                    default: 'Schema',
                },
                strict: {
                    describe:
                        'Fail on likely mistakes in the schema, such as unknown keywords. Disable with --no-strict',
                    type: 'boolean',
                    default: true,
                },
                openApi30: {
                    alias: 'open-api-30',
                    describe:
                        "Read the schema as an OpenAPI 3.0 schema, which allows nullable and example. An OpenAPI document's own version is used instead",
                    type: 'boolean',
                    default: false,
                },
                typedMinItems: {
                    alias: 'typed-min-items',
                    describe:
                        'Largest minItems typed as required items, e.g. [T, ...T[]] for minItems 1. 0 turns it off',
                    type: 'number',
                    default: defaultTypedMinItems,
                },
                ci: {
                    describe: 'Fail if the output file is not up to date. Implies --dry-run',
                    type: 'boolean',
                    default: isCI,
                },
                dryRun: {
                    alias: 'dry-run',
                    describe: 'Do not write the output file',
                    type: 'boolean',
                    default: false,
                },
            })
            .strict(),
    handler: async options => {
        const { output, updated } = await decantFile(options.input, {
            check: options.ci,
            cwd: options.cwd,
            dryRun: options.dryRun,
            name: options.name,
            openApi30: options.openApi30,
            ...(options.output !== undefined && { output: options.output }),
            strict: options.strict,
            typedMinItems: options.typedMinItems,
        });

        if (updated) {
            // eslint-disable-next-line no-console
            console.log(output);
        }
    },
};

export const decantCommandBinding = bind(commandId).withInstance(cli => cli.command(decantCommand));

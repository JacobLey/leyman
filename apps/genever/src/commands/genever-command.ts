import type { Command, GeneverCommandInput } from './lib/types.js';
import { isCI } from 'ci-info';
import { bind } from 'haywire';
import { geneverFile } from '../genever-file.js';
import { defaultTypedMinItems } from '../lib/convert.js';
import { commandId } from './lib/types.js';

interface GeneverCommandExtendedInput extends GeneverCommandInput {
    ci: boolean;
    dryRun: boolean;
    fetch: boolean;
    fetchHost: string[] | undefined;
    force: boolean;
    input: string;
    manifest: string | undefined;
    name: string;
    openApi30: boolean;
    output: string | undefined;
    parameterDefaults: boolean;
    signed: boolean;
    strict: boolean;
    typedMinItems: number;
}

/**
 * Main `genever` command
 */
export const geneverCommand: Command<GeneverCommandExtendedInput> = {
    command: '$0 <input>',
    describe:
        'Write TypeScript types for a JSON Schema file, or the schemas of an OpenAPI document',
    builder: yargs =>
        yargs
            .positional('input', {
                describe:
                    'Path to the JSON Schema file, or OpenAPI document. A .yaml or .yml file is read as YAML',
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
                parameterDefaults: {
                    alias: 'parameter-defaults',
                    describe:
                        "With an OpenAPI document, also write OperationRequest: what a handler gets once a validator fills in parameters' defaults",
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
                fetch: {
                    describe:
                        'Load URLs the schema references. Disable with --no-fetch to load only files',
                    type: 'boolean',
                    default: true,
                },
                fetchHost: {
                    alias: 'fetch-host',
                    describe:
                        'Load only URLs of this host, e.g. example.com, localhost:8080, or *.example.com for its subdomains. Repeat for more hosts',
                    type: 'string',
                    array: true,
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
                signed: {
                    describe:
                        'Sign the output file, and refuse to overwrite it if it was edited or is not signed',
                    type: 'boolean',
                    default: false,
                },
                force: {
                    describe: 'With --signed, overwrite the output file even if it was edited',
                    type: 'boolean',
                    default: false,
                },
                manifest: {
                    describe:
                        'Record the output, and hashes of its inputs, in this manifest. With --ci, an output still matching it is up to date without fetching URLs',
                    type: 'string',
                },
            })
            .check(({ fetch, fetchHost }) => {
                if (!fetch && fetchHost !== undefined) {
                    throw new Error('--fetch-host loads URLs, which --no-fetch disables');
                }
                return true;
            })
            .strict(),
    handler: async options => {
        const { output, updated } = await geneverFile(options.input, {
            check: options.ci,
            cwd: options.cwd,
            dryRun: options.dryRun,
            force: options.force,
            signed: options.signed,
            ...(options.manifest !== undefined && { manifest: options.manifest }),
            fetch: options.fetch ? (options.fetchHost ?? true) : false,
            name: options.name,
            openApi30: options.openApi30,
            ...(options.output !== undefined && { output: options.output }),
            parameterDefaults: options.parameterDefaults,
            strict: options.strict,
            typedMinItems: options.typedMinItems,
        });

        if (updated) {
            // eslint-disable-next-line no-console
            console.log(output);
        }
    },
};

export const geneverCommandBinding = bind(commandId).withInstance(cli =>
    cli.command(geneverCommand)
);

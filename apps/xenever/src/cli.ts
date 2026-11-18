import { isCI } from 'ci-info';
import yargs from 'yargs';
import { EntryScript } from 'entry-script';
import { xeneverFile } from './lib/codegen/xenever-file.js';

const yargsOutput = (e: Error | undefined, _argv: unknown, log: string): void => {
    if (e) {
        process.exitCode = 1;
        if (log) {
            console.error(log);
        }
    } else if (log) {
        console.log(log);
    }
};

/**
 * Reads `--catalog` entries, each `<location>=<path>`. The path follows the last `=`, as a `schemaLocation` URL
 * may hold one in its query.
 *
 * @param entries - the entries as given
 * @returns the catalog, or the problem with an entry
 */
const readCatalog = (
    entries: readonly string[]
): { readonly catalog: Readonly<Record<string, string>> } | { readonly error: string } => {
    const catalog: Record<string, string> = {};
    for (const entry of entries) {
        const separator = entry.lastIndexOf('=');
        const location = entry.slice(0, Math.max(0, separator));
        const path = entry.slice(separator + 1);
        if (separator === -1 || !location || !path) {
            return { error: `--catalog ${JSON.stringify(entry)} is not <location>=<path>` };
        }
        if (Object.hasOwn(catalog, location)) {
            return { error: `--catalog maps ${JSON.stringify(location)} twice` };
        }
        catalog[location] = path;
    }
    return { catalog };
};

/**
 * The xenever CLI. Run `./bin.mjs --help` for options.
 */
export default class Cli extends EntryScript {
    /**
     * Entry point to CLI script.
     *
     * @param argv - process arguments
     */
    public static override async main(argv: string[]): Promise<void> {
        // eslint-disable-next-line import-x/no-relative-parent-imports -- The build is one level below package.json
        const packageJson = await import('../package.json', { with: { type: 'json' } });

        await yargs()
            .scriptName('xenever')
            .option({
                cwd: {
                    type: 'string',
                    default: '.',
                    describe: 'Current working directory',
                },
            })
            .strict()
            .help()
            .alias('help', 'info')
            .version(packageJson.default.version)
            .command(
                '$0 <input>',
                'Write a TypeScript schema, and the types of its values, for an XSD and the files it includes and imports',
                command =>
                    command
                        .positional('input', {
                            describe: 'Path to the XSD',
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
                            ci: {
                                alias: 'check',
                                describe:
                                    'Fail if the output file is not up to date, without writing it. On by default in CI',
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
                                describe:
                                    'With --signed or --manifest, overwrite the output file even if it was edited',
                                type: 'boolean',
                                default: false,
                            },
                            manifest: {
                                describe:
                                    'Record the output, and hashes of every XSD read, in this manifest',
                                type: 'string',
                            },
                            bigint: {
                                describe:
                                    'Read xs:integer, xs:long and the other big integer types as bigint, rather than number',
                                type: 'boolean',
                                default: false,
                            },
                            ordered: {
                                describe:
                                    'A complex type, or an element with an anonymous type, whose children keep their order, in Clark notation: {namespace}local. Repeat for more',
                                type: 'string',
                                array: true,
                            },
                            catalog: {
                                describe:
                                    'A local path for a schemaLocation or import namespace, as <location>=<path>. Repeat for more',
                                type: 'string',
                                array: true,
                            },
                        })
                        .strict(),
                async options => {
                    // Checked here rather than in a builder `.check()`, whose failure still runs the handler when
                    // `parseAsync` is given a callback: https://github.com/yargs/yargs/issues/1975
                    // drop-when: released https://github.com/yargs/yargs/issues/1975
                    const read = readCatalog(options.catalog ?? []);
                    if ('error' in read) {
                        console.error(read.error);
                        process.exitCode = 1;
                        return;
                    }

                    const { output, updated } = await xeneverFile(options.input, {
                        bigint: options.bigint,
                        catalog: read.catalog,
                        check: options.ci,
                        cwd: options.cwd,
                        dryRun: options.dryRun,
                        force: options.force,
                        ...(options.manifest !== undefined && { manifest: options.manifest }),
                        ordered: options.ordered ?? [],
                        ...(options.output !== undefined && { output: options.output }),
                        signed: options.signed,
                    });

                    if (updated) {
                        console.log(output);
                    }
                }
            )
            .parseAsync(argv, {}, yargsOutput);
    }
}

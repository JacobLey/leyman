import type { Argv } from 'yargs';

/**
 * The `[paths..]` positional both commands take.
 *
 * @param yargs - a command's builder
 * @returns the builder, with `paths`
 */
export const pathsPositional = (yargs: Argv): Argv<{ paths: string[] }> =>
    yargs.positional('paths', {
        describe:
            'Git pathspecs to scan, relative to the working directory (default: all of it). A pathspec like ":!docs" leaves a path out',
        type: 'string',
        array: true,
        default: [],
    });

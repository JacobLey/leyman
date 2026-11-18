import type { Argv } from 'yargs';

/**
 * The `[paths..]` positional and `--exclude` option both commands take.
 *
 * @param yargs - a command's builder
 * @returns the builder, with `paths` and `exclude`
 */
export const pathsOptions = (yargs: Argv): Argv<{ paths: string[]; exclude: string[] }> =>
    yargs
        .positional('paths', {
            describe:
                'Files or directories to scan, relative to the working directory (default: all of it)',
            type: 'string',
            array: true,
            default: [],
        })
        .option('exclude', {
            describe:
                'A file, or a directory to leave out everything under, relative to the working directory. Repeat for more',
            type: 'string',
            array: true,
            default: [],
        });

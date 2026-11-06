import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CheckPackageTscError } from './errors.js';
import { findInstalled } from './installed.js';

const execFileAsync = promisify(execFile);

const declarationFile = /\.d\.[cm]?ts$/v;
/**
 * From this major version, files on the command line next to a `tsconfig.json` are an error
 * without `--ignoreConfig`.
 */
const ignoreConfigSince = 6;

/**
 * Runs `tsc`, which exits non-zero when it reports errors, with them on stdout.
 *
 * @param tsc - path of `tsc`
 * @param args - arguments
 * @param cwd - directory to run in
 * @returns what `tsc` printed
 */
const runTsc = async (tsc: string, args: readonly string[], cwd: string): Promise<string> => {
    try {
        const { stdout } = await execFileAsync(tsc, args, { cwd });
        return stdout;
    } catch (error) {
        return (error as { stdout: string }).stdout;
    }
};

/**
 * Type checks the published declaration files as a strict consumer with `skipLibCheck: false`
 * would. A `@ts-expect-error` in the source doesn't reach the declarations, so an error it hid
 * surfaces only here. Errors in dependencies' declarations are not the package's to fix, so only
 * those in its own files, and those about the check itself, are reported.
 *
 * @param params - the package, what it publishes, and the `tsc` to check with
 * @param params.cwd - the package directory
 * @param params.files - the paths in the tarball
 * @param params.tsc - path of `tsc`, or `null` to find the nearest installed one
 * @returns each problem found
 * @rejects {CheckPackageTscError} when the package publishes declarations and no `tsc` is found
 */
export const declarationProblems = async ({
    cwd,
    files,
    tsc,
}: {
    cwd: string;
    files: readonly string[];
    tsc: string | null;
}): Promise<string[]> => {
    const declarations = files.filter(file => declarationFile.test(file));
    if (declarations.length === 0) {
        return [];
    }
    const tscPath = tsc ?? (await findInstalled(cwd, '.bin/tsc'));
    if (tscPath === null) {
        throw new CheckPackageTscError(
            `The package publishes declarations, but no tsc is installed in ${cwd} or above it. Install typescript, or pass the path of tsc (--tsc).`
        );
    }
    const [version, nodeTypes] = await Promise.all([
        runTsc(tscPath, ['--version'], cwd),
        findInstalled(cwd, '@types/node/package.json'),
    ]);
    const major = Number(/^Version (?<major>\d+)/v.exec(version)?.groups?.major);
    const output = await runTsc(
        tscPath,
        [
            ...(major >= ignoreConfigSince ? ['--ignoreConfig'] : []),
            '--noEmit',
            '--pretty',
            'false',
            '--strict',
            '--skipLibCheck',
            'false',
            '--module',
            'nodenext',
            '--target',
            'esnext',
            '--lib',
            'esnext,dom',
            // Only Node.js's types when they are installed: otherwise every visible `@types` package,
            // rather than an error about a missing one
            ...(nodeTypes === null ? [] : ['--types', 'node']),
            ...declarations,
        ],
        cwd
    );
    const own = new Set(declarations);
    // Each diagnostic is `<file>(<line>,<column>): error ...`, or `error ...` when it is about the
    // check itself, followed by indented detail
    return output
        .split('\n')
        .filter(line => line.startsWith('error ') || own.has(line.slice(0, line.indexOf('('))))
        .map(line => `tsc (skipLibCheck: false): ${line}`);
};

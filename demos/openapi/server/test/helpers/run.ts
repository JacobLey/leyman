import { execFile } from 'node:child_process';

/**
 * Runs a command to completion. Fails with everything it printed when it exits with anything but 0, so a failing
 * `go build` or `go test` says why.
 *
 * @param command - Executable, found on `PATH`
 * @param args - Its arguments
 * @param options - Where to run it, and environment variables on top of this process's
 * @param options.cwd - Working directory
 * @param options.env - Added to this process's environment
 * @returns What it printed to stdout
 */
export const run = async (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env?: Readonly<Record<string, string>> }
): Promise<string> =>
    new Promise((resolve, reject) => {
        execFile(
            command,
            args,
            // eslint-disable-next-line n/no-process-env -- The command needs this process's too: PATH, DATABASE_URL, Go's caches
            { cwd: options.cwd, env: { ...process.env, ...options.env } },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${command} ${args.join(' ')} failed:\n${stdout}${stderr}`));
                } else {
                    resolve(stdout);
                }
            }
        );
    });

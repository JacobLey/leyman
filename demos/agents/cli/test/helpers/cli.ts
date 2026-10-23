import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { approveDevice, followAuthorization } from '@leyman/demo-oauth-server';

export interface CliResult {
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

export interface CliOptions {
    /**
     * Over the test's own environment, e.g. `BROWSER`.
     */
    readonly env?: Readonly<Record<string, string | undefined>>;
    /**
     * Written to stdin, which is then closed.
     */
    readonly input?: string;
    /**
     * Plays the user who opens the printed URL themselves (no `BROWSER`): signs in and comes back to the CLI, or, for
     * a device login, approves it.
     */
    readonly openPrintedUrl?: boolean;
    /**
     * With `openPrintedUrl`, for a device login: says the code isn't the one shown.
     */
    readonly denyDevice?: boolean;
}

/**
 * The browser `notes login` opens in tests: an executable, as `$BROWSER` must be, running `browser.ts`.
 */
export const testBrowser = Path.join(
    await mkdtemp(Path.join(tmpdir(), 'notes-browser-')),
    'browser'
);
await writeFile(
    testBrowser,
    `#!/bin/sh\nexec "${process.execPath}" "${Path.join(import.meta.dirname, 'browser.js')}" "$@"\n`,

    { mode: 0o755 }
);

/**
 * Runs the CLI as a separate process, as anyone would.
 *
 * @param configDir - Where it keeps its login
 * @param args - Its arguments
 * @param options - Environment, stdin, and the user's part
 * @returns Its exit code and output
 */
export const notes = async (
    configDir: string,
    args: readonly string[],
    options: CliOptions = {}
): Promise<CliResult> => {
    const child = spawn('./bin.mjs', [...args], {
        // Leaves out a variable set to `undefined`, rather than setting it to "undefined"
        env: Object.fromEntries(
            Object.entries({
                // eslint-disable-next-line n/no-process-env -- Everything else as the test runs with
                ...process.env,
                NOTES_CONFIG_DIR: configDir,
                BROWSER: undefined,
                ...options.env,
            }).filter((entry): entry is [string, string] => entry[1] !== undefined)
        ),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', async (chunk: string) => {
        stderr += chunk;
        const printed = /Log in at: (?<url>\S+)/v.exec(chunk)?.groups?.url;
        if (printed === undefined || options.openPrintedUrl !== true) {
            return;
        }
        const authorization = new URL(printed);
        // A device login's URL has its code
        if (authorization.searchParams.has('user_code')) {
            await approveDevice(authorization, { deny: options.denyDevice });
            return;
        }
        const callback = await followAuthorization(
            authorization,
            authorization.searchParams.get('redirect_uri')!
        );
        await fetch(callback);
    });
    child.stdin.end(options.input ?? '');
    const [code] = (await once(child, 'close')) as [number | null];
    return { code, stdout, stderr };
};

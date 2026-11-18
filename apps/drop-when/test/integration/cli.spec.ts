import { execFile } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { createDirectory } from '#test/helpers/directory.js';

const execFileAsync = promisify(execFile);
const bin = Path.resolve('bin.mjs');
const token = ['drop', 'when:'].join('-');

/**
 * Runs the CLI, resolving with its output and exit code whether or not it fails.
 *
 * @param cwd - working directory
 * @param env - environment variables
 * @param args - arguments
 * @returns output and exit code
 */
const runWithEnv = async (
    cwd: string,
    env: Readonly<Record<string, string | undefined>>,
    ...args: readonly string[]
): Promise<{ stdout: string; stderr: string; code: number }> => {
    try {
        const { stdout, stderr } = await execFileAsync(bin, args, { cwd, env });
        return { stdout, stderr, code: 0 };
    } catch (error) {
        const { stdout, stderr, code } = error as { stdout: string; stderr: string; code: number };
        return { stdout, stderr, code };
    }
};

// GITHUB_TOKEN is left out, so no test depends on the one running them
const withoutToken = Object.fromEntries(
    // eslint-disable-next-line n/no-process-env -- The environment the CLI runs in
    Object.entries(process.env).filter(([key]) => key !== 'GITHUB_TOKEN')
);

/**
 * Runs the CLI, without `GITHUB_TOKEN`.
 *
 * @param cwd - working directory
 * @param args - arguments
 * @returns output and exit code
 */
const run = async (
    cwd: string,
    ...args: readonly string[]
): Promise<{ stdout: string; stderr: string; code: number }> =>
    runWithEnv(cwd, withoutToken, ...args);

suite('cli', () => {
    test('--help lists every command', async () => {
        const { stdout } = await run('.', '--help');

        expect(stdout).to.contain('drop-when check [paths..]');
        expect(stdout).to.contain('drop-when report [paths..]');
    });

    test('Fails without a command', async () => {
        const { stderr, code } = await run('.');

        expect(code).to.equal(1);
        expect(stderr).to.contain('Choose a command');
    });

    suite('check', () => {
        const withDirectory = beforeEach(async () => createDirectory());

        withDirectory.afterEach(async ({ directory }) => {
            await directory.cleanup();
        });

        withDirectory.test('Counts the markers', async ({ directory, write }) => {
            await write({ 'a.ts': `// ${token} 2026-01-01\n` });

            const { stdout, code } = await run(directory.path, 'check');
            expect(code).to.equal(0);
            expect(stdout).to.equal('1 marker in 1 file, none malformed\n');
        });

        withDirectory.test('Counts several', async ({ directory, write }) => {
            await write({ 'a.ts': `// ${token} 2026-01-01\n// ${token} 2026-01-02\n`, 'b.ts': '' });

            const { stdout } = await run(directory.path, 'check');
            expect(stdout).to.equal('2 markers in 2 files, none malformed\n');
        });

        withDirectory.test(
            'Fails on a malformed marker, naming where',
            async ({ directory, write }) => {
                await write({ 'a.ts': `\n// ${token} 2026-02-30\n` });

                const { stderr, code } = await run(directory.path, 'check');
                expect(code).to.equal(1);
                expect(stderr).to.equal('a.ts:2: 2026-02-30 is not a day\n1 malformed marker\n');
            }
        );

        withDirectory.test('Checks only the paths given', async ({ directory, write }) => {
            await write({ 'a/a.ts': `// ${token} 2026-01-01\n`, 'b/b.ts': `// ${token} soon\n` });

            const { code } = await run(directory.path, 'check', 'a');
            expect(code).to.equal(0);
        });

        withDirectory.test('Leaves out what --exclude names', async ({ directory, write }) => {
            await write({
                'a.ts': `// ${token} soon\n`,
                'b/b.ts': `// ${token} soon\n`,
                'c.ts': '',
            });

            const { stdout } = await run(
                directory.path,
                'check',
                '--exclude',
                'a.ts',
                '--exclude',
                'b'
            );
            expect(stdout).to.equal('0 markers in 1 file, none malformed\n');
        });

        withDirectory.test('Fails on a path that does not exist', async ({ directory }) => {
            const { stderr, code } = await run(directory.path, 'check', 'missing');
            expect(code).to.equal(1);
            expect(stderr).to.equal('missing does not exist\n');
        });
    });

    suite('report', () => {
        const withDirectory = beforeEach(async () => createDirectory());

        withDirectory.afterEach(async ({ directory }) => {
            await directory.cleanup();
        });

        withDirectory.test('Prints the report', async ({ directory, write }) => {
            await write({ 'a.ts': `// ${token} 2000-01-01\n// ${token} 9999-12-31\n` });

            const { stdout, code } = await runWithEnv(
                directory.path,
                { ...withoutToken, GITHUB_TOKEN: 'secret' },
                'report',
                '--min-age',
                '7d'
            );
            expect(code).to.equal(0);
            expect(stdout).to.contain('## Due\n\n- `a.ts:1` 2000-01-01\n');
            expect(stdout).to.contain(
                '## Waiting\n\n- `a.ts:2` 9999-12-31: due on 9999-12-31T00:00Z\n'
            );
        });

        withDirectory.test(
            'Fails on a marker due, with --fail-on-due',
            async ({ directory, write }) => {
                await write({ 'a.ts': `// ${token} 2000-01-01\n` });

                const { code } = await run(
                    directory.path,
                    'report',
                    '--min-age',
                    '7d',
                    '--fail-on-due'
                );
                expect(code).to.equal(1);
            }
        );

        withDirectory.test('Requires --min-age', async ({ directory }) => {
            const { stderr, code } = await run(directory.path, 'report');

            expect(code).to.equal(1);
            expect(stderr).to.contain('Missing required argument: min-age');
        });
    });
});

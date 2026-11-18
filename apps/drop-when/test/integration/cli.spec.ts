import { execFile } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { createRepo } from '#test/helpers/repo.js';

const execFileAsync = promisify(execFile);
const bin = Path.resolve('bin.mjs');
const token = ['drop', 'when:'].join('-');

/**
 * Runs the CLI, resolving with its output and exit code whether or not it fails.
 *
 * @param cwd - working directory
 * @param args - arguments
 * @returns output and exit code
 */
const run = async (
    cwd: string,
    ...args: readonly string[]
): Promise<{ stdout: string; stderr: string; code: number }> => {
    try {
        const { stdout, stderr } = await execFileAsync(bin, args, { cwd });
        return { stdout, stderr, code: 0 };
    } catch (error) {
        const { stdout, stderr, code } = error as { stdout: string; stderr: string; code: number };
        return { stdout, stderr, code };
    }
};

suite('cli', () => {
    test('--help lists every command', async () => {
        const { stdout } = await run('.', '--help');

        expect(stdout).to.contain('drop-when check [paths..]');
    });

    test('Fails without a command', async () => {
        const { stderr, code } = await run('.');

        expect(code).to.equal(1);
        expect(stderr).to.contain('Choose a command');
    });

    suite('check', () => {
        const withRepo = beforeEach(async () => createRepo());

        withRepo.afterEach(async ({ repo }) => {
            await repo.cleanup();
        });

        withRepo.test('Counts the markers', async ({ repo, write }) => {
            await write({ 'a.ts': `// ${token} 2026-01-01\n` });

            const { stdout, code } = await run(repo.path, 'check');
            expect(code).to.equal(0);
            expect(stdout).to.equal('1 marker in 1 file, none malformed\n');
        });

        withRepo.test('Counts several', async ({ repo, write }) => {
            await write({ 'a.ts': `// ${token} 2026-01-01\n// ${token} 2026-01-02\n`, 'b.ts': '' });

            const { stdout } = await run(repo.path, 'check');
            expect(stdout).to.equal('2 markers in 2 files, none malformed\n');
        });

        withRepo.test('Fails on a malformed marker, naming where', async ({ repo, write }) => {
            await write({ 'a.ts': `\n// ${token} 2026-02-30\n` });

            const { stderr, code } = await run(repo.path, 'check');
            expect(code).to.equal(1);
            expect(stderr).to.equal('a.ts:2: 2026-02-30 is not a day\n1 malformed marker\n');
        });

        withRepo.test('Checks only the paths given', async ({ repo, write }) => {
            await write({ 'a/a.ts': `// ${token} 2026-01-01\n`, 'b/b.ts': `// ${token} soon\n` });

            const { code } = await run(repo.path, 'check', 'a');
            expect(code).to.equal(0);
        });
    });

    suite('check outside a git repository', () => {
        const withDirectory = beforeEach(async () => createRepo({ git: false }));

        withDirectory.afterEach(async ({ repo }) => {
            await repo.cleanup();
        });

        withDirectory.test('Fails', async ({ repo }) => {
            const { stderr, code } = await run(repo.path, 'check');
            expect(code).to.equal(1);
            expect(stderr).to.contain('not a git repository');
        });
    });
});

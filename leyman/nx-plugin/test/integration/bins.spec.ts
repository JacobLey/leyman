import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';

const execFileAsync = promisify(execFile);

// Compiled to `dist-test/integration/`
const scripts = Path.join(import.meta.dirname, '../../scripts');

const bins = {
    'leyman-biome-format': 'biome-format.sh',
    'leyman-clean-dist': 'clean-dist.sh',
    'leyman-coverage-report': 'coverage-report.sh',
    'leyman-swc-compile': 'swc-compile.sh',
    'leyman-sync-injected': 'sync-injected.mjs',
} as const;

// An unformatted source and a `dist/` with no build info, which formatting or cleaning would change
const files = {
    'package.json': '{ "name": "pkg",   "version": "1.0.0" }\n',
    'dist/index.js': 'export {};\n',
} as const;

const run = async (
    file: string,
    args: readonly string[],
    cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> => {
    const command = file.endsWith('.mjs') ? process.execPath : 'bash';
    try {
        const { stdout, stderr } = await execFileAsync(
            command,
            [Path.join(scripts, file), ...args],
            {
                cwd,
                // Not in CI, so biome-format would write if it ran
                // eslint-disable-next-line n/no-process-env -- Everything else as the test runs with
                env: { ...process.env, CI: 'false' },
            }
        );
        return { code: 0, stdout, stderr };
    } catch (error) {
        const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
        return { code, stdout, stderr };
    }
};

const snapshot = async (dir: string): Promise<Record<string, string>> => {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    const contents = await Promise.all(
        entries
            .filter(entry => entry.isFile())
            .map(async entry => {
                const path = Path.join(entry.parentPath, entry.name);
                return [Path.relative(dir, path), await readFile(path, 'utf8')] as const;
            })
    );
    return Object.fromEntries(contents);
};

suite('bins', () => {
    const withDir = beforeEach(async () => {
        const dir = await mkdtemp(Path.join(Os.tmpdir(), 'nx-plugin-bins-'));
        await mkdir(Path.join(dir, 'dist'));
        await Promise.all(
            Object.entries(files).map(async ([path, content]) =>
                writeFile(Path.join(dir, path), content)
            )
        );
        return { dir };
    });

    withDir.afterEach(async ({ dir }) => {
        await rm(dir, { recursive: true, force: true });
    });

    for (const [bin, file] of Object.entries(bins)) {
        suite(bin, () => {
            withDir.test('--help prints usage and changes nothing', async ({ dir }) => {
                const result = await run(file, ['--help'], dir);
                expect(result).to.include({ code: 0 });
                expect(result.stdout).to.match(new RegExp(String.raw`^Usage: ${bin}\b`, 'v'));
                expect(await snapshot(dir)).to.deep.equal(files);
            });

            withDir.test('an unknown flag fails and changes nothing', async ({ dir }) => {
                const result = await run(file, ['--unknown'], dir);
                expect(result).to.include({ code: 2 });
                expect(result.stderr).to.include(`Usage: ${bin}`);
                expect(await snapshot(dir)).to.deep.equal(files);
            });
        });
    }

    test('leyman-swc-compile needs exactly its three arguments', async () => {
        const result = await run(bins['leyman-swc-compile'], ['./src', './dist'], Os.tmpdir());
        expect(result).to.include({ code: 2 });
    });
});

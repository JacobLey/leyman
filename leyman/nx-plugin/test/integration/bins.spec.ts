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
    'leyman-portable-coverage': 'portable-coverage.mjs',
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
    cwd: string,
    env: Readonly<Record<string, string | undefined>> = {}
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
                env: { ...process.env, CI: 'false', ...env },
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

    suite('leyman-portable-coverage', () => {
        const file = bins['leyman-portable-coverage'];
        const placeholder = '/__leyman_workspace_root__/';

        withDir.test('needs a mode and a directory', async ({ dir }) => {
            for (const args of [[], ['copy', '.'], ['store'], ['store', '.', '.']]) {
                const result = await run(file, args, dir, { NX_WORKSPACE_ROOT: '/a' });
                expect(result).to.include({ code: 2 });
                expect(result.stderr).to.include('Usage: leyman-portable-coverage');
            }
            expect(await snapshot(dir)).to.deep.equal(files);
        });

        withDir.test('needs an absolute workspace root other than /', async ({ dir }) => {
            for (const root of [undefined, '', 'a/b', '/', '//']) {
                const result = await run(file, ['store', '.'], dir, { NX_WORKSPACE_ROOT: root });
                expect(result).to.include({ code: 2 });
                expect(result.stderr).to.include(
                    'NX_WORKSPACE_ROOT must be an absolute path other than /'
                );
            }
            expect(await snapshot(dir)).to.deep.equal(files);
        });

        withDir.test('stores paths without the root, and restores another', async ({ dir }) => {
            const coverage = Path.join(dir, 'coverage');
            await mkdir(Path.join(coverage, 'nested'), { recursive: true });
            const json = JSON.stringify({
                result: [{ url: 'file:///a/b/src/index.js' }, { url: 'file:///a/bc/src/index.js' }],
                'source-map-cache': {
                    'file:///a/b/dist/index.js': { data: { sources: ['/a/b/src/index.ts'] } },
                },
            });
            await Promise.all([
                writeFile(Path.join(coverage, 'coverage-1.json'), json),
                writeFile(Path.join(coverage, 'notes.txt'), '/a/b/'),
                writeFile(Path.join(coverage, 'nested', 'coverage-2.json'), '/a/b/'),
            ]);

            const stored = await run(file, ['store', coverage], dir, {
                NX_WORKSPACE_ROOT: '/a/b',
            });
            expect(stored).to.include({ code: 0 });
            const storedJson = await readFile(Path.join(coverage, 'coverage-1.json'), 'utf8');
            expect(storedJson).to.not.include('/a/b/');
            expect(storedJson).to.include(`file://${placeholder}src/index.js`);
            expect(storedJson).to.include(`"${placeholder}src/index.ts"`);
            expect(storedJson).to.include('file:///a/bc/src/index.js');
            // Only the JSON files directly in the directory
            expect(await readFile(Path.join(coverage, 'notes.txt'), 'utf8')).to.equal('/a/b/');
            expect(
                await readFile(Path.join(coverage, 'nested', 'coverage-2.json'), 'utf8')
            ).to.equal('/a/b/');

            const restored = await run(file, ['restore', coverage], dir, {
                NX_WORKSPACE_ROOT: '/x/y/',
            });
            expect(restored).to.include({ code: 0 });
            expect(
                JSON.parse(await readFile(Path.join(coverage, 'coverage-1.json'), 'utf8'))
            ).to.deep.equal({
                result: [{ url: 'file:///x/y/src/index.js' }, { url: 'file:///a/bc/src/index.js' }],
                'source-map-cache': {
                    'file:///x/y/dist/index.js': { data: { sources: ['/x/y/src/index.ts'] } },
                },
            });
        });
    });
});

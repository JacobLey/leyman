import type { Context } from 'mocha';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';

const execFileAsync = promisify(execFile);

// Compiled to `dist-test/integration/`
const script = Path.join(import.meta.dirname, '../../scripts/sync-injected.mjs');

const writeFiles = async (root: string, files: Record<string, unknown>): Promise<void> => {
    for (const [path, content] of Object.entries(files)) {
        const file = Path.join(root, path);
        await mkdir(Path.dirname(file), { recursive: true });
        await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
    }
};

const listFiles = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter(entry => entry.isFile())
        .map(entry => Path.relative(dir, Path.join(entry.parentPath, entry.name)))
        .toSorted((a, b) => a.localeCompare(b, 'en'));
};

const packageJson = {
    name: '@scope/pkg',
    version: '1.2.3',
    description: 'Inert',
    type: 'module',
    files: ['dist', '!dist/**/*.map'],
    devDependencies: { inert: '1.0.0' },
};

suite('sync-injected', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        this.timeout(10_000);
        const root = await mkdtemp(Path.join(Os.tmpdir(), 'sync-injected-'));
        const store = Path.join(root, 'node_modules/.pnpm');
        const copy = Path.join(store, '@scope+pkg@file+pkg/node_modules/@scope/pkg');
        const peerCopy = Path.join(
            store,
            '@scope+pkg@file+pkg_react@19.0.0/node_modules/@scope/pkg'
        );
        const otherPackage = Path.join(store, '@scope+pkg@file+pkgs/node_modules/@scope/pkg');

        await writeFiles(Path.join(root, 'pkg'), {
            'package.json': packageJson,
            'src/index.ts': '',
            'src/other/index.ts': '',
            'dist/index.js': 'export {};\n',
            'dist/same.js': 'same',
            'dist/changed.js': 'new',
            'dist/index.d.ts': 'export {};\n',
            'dist/index.d.ts.map': { version: 3, sources: ['../src/index.ts'], mappings: '' },
            'dist/other/index.d.ts': 'export {};\n',
            'dist/other/index.d.ts.map': {
                version: 3,
                sourceRoot: '../../src/other',
                sources: ['index.ts'],
                mappings: '',
            },
            'dist/unmapped.d.ts': 'export {};\n',
        });
        await writeFiles(copy, {
            'package.json': packageJson,
            'dist/index.js': 'stale',
            'dist/same.js': 'same',
            'dist/changed.js': 'old',
            'gone/deep/file.js': '',
        });
        await writeFiles(peerCopy, { 'package.json': packageJson });
        await writeFiles(otherPackage, { 'package.json': packageJson });

        return { root, copy, peerCopy, otherPackage };
    });
    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    const syncInjected = async (root: string): Promise<void> => {
        await execFileAsync(process.execPath, [script], {
            cwd: Path.join(root, 'pkg'),
            env: {
                // eslint-disable-next-line n/no-process-env -- pnpm from PATH, as Nx runs it
                ...process.env,
                NX_WORKSPACE_ROOT: root,
                NX_TASK_TARGET_PROJECT: '@scope/pkg',
            },
        });
    };

    withWorkspace.test(
        'Writes the fields of package.json that can affect a dependent',
        async ({ root }) => {
            await syncInjected(root);

            const surface: unknown = JSON.parse(
                await readFile(
                    Path.join(root, '.package-surface/@scope/pkg/package-surface.json'),
                    'utf8'
                )
            );
            expect(surface).to.deep.equal({
                name: '@scope/pkg',
                type: 'module',
                files: ['dist', '!dist/**/*.map'],
            });
        }
    );

    withWorkspace.test(
        'Mirrors the published files into every copy of the package',
        async ({ root, copy, peerCopy, otherPackage }) => {
            await syncInjected(root);

            const expected = [
                'dist/changed.js',
                'dist/index.d.ts',
                'dist/index.d.ts.map',
                'dist/index.js',
                'dist/other/index.d.ts',
                'dist/other/index.d.ts.map',
                'dist/same.js',
                'dist/unmapped.d.ts',
                'package.json',
            ];
            expect(await listFiles(copy)).to.deep.equal(expected);
            expect(await listFiles(peerCopy)).to.deep.equal(expected);
            expect(await readdir(copy)).to.not.include('gone');
            expect(await readFile(Path.join(copy, 'dist/index.js'), 'utf8')).to.equal(
                'export {};\n'
            );
            expect(await readFile(Path.join(copy, 'dist/changed.js'), 'utf8')).to.equal('new');
            expect(await listFiles(otherPackage)).to.deep.equal(['package.json']);
        }
    );

    withWorkspace.test(
        "Points the copies' declaration maps at the workspace source",
        async ({ root, copy }) => {
            await syncInjected(root);
            // Again, with every file already in place
            await syncInjected(root);

            for (const [map, source] of [
                ['dist/index.d.ts.map', 'pkg/src/index.ts'],
                ['dist/other/index.d.ts.map', 'pkg/src/other/index.ts'],
            ] as const) {
                const { sourceRoot, sources } = JSON.parse(
                    await readFile(Path.join(copy, map), 'utf8')
                ) as { sourceRoot: string; sources: string[] };
                expect(sourceRoot).to.equal('');
                expect(sources).to.deep.equal([
                    Path.relative(Path.dirname(Path.join(copy, map)), Path.join(root, source)),
                ]);
            }
        }
    );
});

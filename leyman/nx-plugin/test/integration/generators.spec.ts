import type { Context } from 'mocha';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import Os from 'node:os';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';

const execFileAsync = promisify(execFile);

// Compiled to `dist-test/integration/`
const packageRoot = Path.join(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const nxPackageJsonPath = require.resolve('nx/package.json');
const nxRoot = Path.dirname(nxPackageJsonPath);
const nxBin = Path.join(
    nxRoot,
    (JSON.parse(await readFile(nxPackageJsonPath, 'utf8')) as { bin: { nx: string } }).bin.nx
);
const nxLifecycleRoot = Path.dirname(require.resolve('nx-lifecycle/package.json'));

// Keeps PATH for shell commands, but isolates from the Nx run executing these tests
const env = {
    ...Object.fromEntries(
        // eslint-disable-next-line n/no-process-env -- A copy of the environment, without the outer run's NX_ variables
        Object.entries(process.env).filter(([key]) => !key.startsWith('NX_'))
    ),
    CI: 'false',
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_SKIP_NX_CACHE: 'true',
};

const catalogYaml = `packages:
  - packages/*
catalog:
  '@biomejs/biome': ^2.0.0
  '@leyman/check-package': ^1.0.0
  '@leyman/configs': ^1.0.0
  '@leyman/eslint-config': ^1.0.0
  '@leyman/expect': ^1.0.0
  '@nx/js': ^23.0.0
  '@swc/cli': ^0.7.0
  '@swc/core': ^1.0.0
  '@types/mocha': ^10.0.0
  '@types/node': ^25.0.0
  c8: ^11.0.0
  eslint: ^10.0.0
  mocha: ^11.0.0
  mocha-chain: ^1.0.0
  nx-lifecycle: ^1.0.0
  typescript: ^6.0.0
`;

interface ShownProject {
    targets: Record<string, { dependsOn?: unknown[] }>;
}

/**
 * Runs the generators through Nx, in a workspace that installs this package, as a consumer would.
 */
suite('Generators', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        this.timeout(10_000);

        const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-plugin-generators-'));
        await mkdir(Path.join(root, 'node_modules/@leyman'), { recursive: true });
        await symlink(nxRoot, Path.join(root, 'node_modules/nx'));
        await symlink(nxLifecycleRoot, Path.join(root, 'node_modules/nx-lifecycle'));
        await symlink(packageRoot, Path.join(root, 'node_modules/@leyman/nx-plugin'));
        await writeFile(
            Path.join(root, 'package.json'),
            JSON.stringify({ name: 'workspace', private: true })
        );
        await writeFile(Path.join(root, 'nx.json'), '{}');
        await writeFile(Path.join(root, 'pnpm-workspace.yaml'), catalogYaml);

        const nx = async (...args: string[]): Promise<string> => {
            const { stdout } = await execFileAsync(process.execPath, [nxBin, ...args], {
                cwd: root,
                env,
            });
            return stdout;
        };
        const readJson = async <T>(path: string): Promise<T> =>
            JSON.parse(await readFile(Path.join(root, path), 'utf8')) as T;

        return { root, nx, readJson };
    });

    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    withWorkspace.test(
        'Sets the workspace up, then adds a package whose targets are wired',
        async function (this: Context, { nx, readJson }) {
            this.timeout(60_000);

            await nx('g', '@leyman/nx-plugin:init', '--skipInstall');
            await nx(
                'g',
                '@leyman/nx-plugin:package',
                'packages/my-lib',
                '--description=Does things.',
                '--skipInstall'
            );

            const { devDependencies } = await readJson<{
                devDependencies: Record<string, string>;
            }>('package.json');
            expect(devDependencies).to.include({
                '@leyman/configs': 'catalog:',
                'nx-lifecycle': 'catalog:',
            });
            const shown = JSON.parse(
                await nx('show', 'project', 'my-lib', '--json')
            ) as ShownProject;
            expect(Object.keys(shown.targets)).to.include.members([
                'biome',
                'eslint',
                'tsc',
                'tsc-test',
                'mocha-unit-test',
                'coverage-report',
                'build:run',
                'verify',
            ]);
            expect(shown.targets['build:run']!.dependsOn).to.deep.equal(['build:_', 'tsc']);
        }
    );
});

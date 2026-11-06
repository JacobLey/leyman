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

const writeJson = async (path: string, data: unknown): Promise<void> => {
    await mkdir(Path.dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2));
};

interface ShownProject {
    namedInputs?: Record<string, unknown[]>;
    targets: Record<
        string,
        {
            cache?: boolean;
            dependsOn?: unknown[];
            executor?: string;
            options?: { commands?: string[] };
        }
    >;
}

/**
 * Runs Nx in a workspace that installs this package, as a consumer would.
 */
suite('Nx workspace', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        this.timeout(10_000);

        const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-plugin-'));
        await mkdir(Path.join(root, 'node_modules/@leyman'), { recursive: true });
        await symlink(nxRoot, Path.join(root, 'node_modules/nx'));
        await symlink(nxLifecycleRoot, Path.join(root, 'node_modules/nx-lifecycle'));
        await symlink(packageRoot, Path.join(root, 'node_modules/@leyman/nx-plugin'));
        await writeJson(Path.join(root, 'package.json'), { name: 'workspace', private: true });

        // Published, tested with Mocha, and a dependency of b
        await writeJson(Path.join(root, 'packages/a/package.json'), {
            name: 'a',
            devDependencies: { mocha: '*' },
        });
        await writeJson(Path.join(root, 'packages/a/tsconfig.json'), {});
        await writeJson(Path.join(root, 'packages/a/test/tsconfig.json'), {});
        await mkdir(Path.join(root, 'packages/a/src'));
        await mkdir(Path.join(root, 'packages/a/test/unit'));
        await writeFile(Path.join(root, 'packages/a/eslint.config.js'), 'export default [];');
        await writeJson(Path.join(root, 'packages/a/project.json'), {
            name: 'a',
            targets: { tsc: {}, 'coverage-report': { cache: false } },
        });
        await writeJson(Path.join(root, 'packages/b/package.json'), {
            name: 'b',
            private: true,
            dependencies: { a: '*' },
        });
        await writeJson(Path.join(root, 'packages/b/project.json'), { name: 'b' });

        const writeNxJson = async (options: unknown): Promise<void> =>
            writeJson(Path.join(root, 'nx.json'), {
                plugins: [
                    { plugin: '@leyman/nx-plugin', options },
                    {
                        plugin: 'nx-lifecycle/plugin',
                        options: {
                            stages: { build: { hooks: ['run'], dependsOn: ['^build'] } },
                            bindings: { tsc: 'build:run' },
                        },
                    },
                ],
            });

        const showProject = async (name: string): Promise<ShownProject> => {
            const { stdout } = await execFileAsync(
                process.execPath,
                [nxBin, 'show', 'project', name, '--json'],
                { cwd: root, env }
            );
            return JSON.parse(stdout) as ShownProject;
        };

        return { root, writeNxJson, showProject };
    });

    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    withWorkspace.test(
        "Infers each project's targets from its files",
        async function (this: Context, { writeNxJson, showProject }) {
            this.timeout(60_000);
            // Without options
            await writeNxJson(undefined);

            const a = await showProject('a');
            const b = await showProject('b');

            expect(Object.keys(a.targets)).to.include.members([
                'biome',
                'eslint',
                'check-package',
                'update-ts-references',
                'tsc',
                'tsc-test',
                'mocha-unit-test',
                'coverage-report',
                'sync-injected',
            ]);
            expect(a.targets.tsc!.options!.commands).to.deep.equal([
                'leyman-clean-dist',
                'leyman-swc-compile ./src ./dist node_modules/@leyman/configs/swcrc.jsonc',
                // eslint-disable-next-line no-template-curly-in-string -- The shell's syntax
                '${TSC:-tsc}',
            ]);
            expect(a.namedInputs).to.have.property('ts-source');
            expect(Object.keys(b.targets)).to.include('biome').and.not.include('tsc');
        }
    );

    withWorkspace.test(
        'Merges project.json over inferred targets, and nx-lifecycle wires them',
        async function (this: Context, { writeNxJson, showProject }) {
            this.timeout(60_000);
            await writeNxJson({ targets: { biome: false, eslint: { name: 'lint' } } });

            const a = await showProject('a');

            expect(a.targets['coverage-report']).to.include({
                executor: 'nx:run-commands',
                cache: false,
            });
            expect(a.targets.tsc!.dependsOn).to.deep.equal(['build:_']);
            expect(a.targets['build:run']!.dependsOn).to.deep.equal(['build:_', 'tsc']);
            expect(Object.keys(a.targets))
                .to.include('lint')
                .and.not.include.members(['biome', 'eslint']);
        }
    );

    withWorkspace.test(
        'Fails on invalid options',
        async function (this: Context, { writeNxJson, showProject }) {
            this.timeout(60_000);
            await writeNxJson({ targets: { tsc: { name: 1 } } });

            const thrown: unknown = await expect(showProject('a')).to.be.rejectedWith(Error);

            expect(thrown)
                .to.have.property('stderr')
                .that.includes('Invalid @leyman/nx-plugin options in nx.json:');
        }
    );
});

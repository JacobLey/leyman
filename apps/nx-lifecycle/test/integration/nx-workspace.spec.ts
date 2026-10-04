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

const packageRoot = Path.join(import.meta.dirname, '../..');
const nxPackageJsonPath = createRequire(import.meta.url).resolve('nx/package.json');
const nxRoot = Path.dirname(nxPackageJsonPath);
const nxPackageJson = JSON.parse(await readFile(nxPackageJsonPath, 'utf8')) as {
    bin: { nx: string };
};
const nxBin = Path.join(nxRoot, nxPackageJson.bin.nx);

// Keeps PATH for shell commands, but isolates from the Nx run executing these tests
const env = {
    ...Object.fromEntries(
        // eslint-disable-next-line n/no-process-env
        Object.entries(process.env).filter(([key]) => !key.startsWith('NX_'))
    ),
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_SKIP_NX_CACHE: 'true',
};

const stages = {
    build: {
        hooks: ['run'],
        dependsOn: ['^build'],
    },
};
const bindings = {
    compile: 'build:run',
};

const writeJson = async (path: string, data: unknown): Promise<void> => {
    await mkdir(Path.dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2));
};

/**
 * Runs Nx in a workspace that installs this package, as a consumer would.
 */
suite('Nx workspace', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        this.timeout(10_000);

        const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-lifecycle-'));
        await mkdir(Path.join(root, 'node_modules'));
        await symlink(nxRoot, Path.join(root, 'node_modules/nx'));
        await symlink(packageRoot, Path.join(root, 'node_modules/nx-lifecycle'));
        await writeJson(Path.join(root, 'package.json'), { name: 'workspace', private: true });

        await writeJson(Path.join(root, 'packages/a/project.json'), {
            name: 'a',
            targets: {
                compile: { command: 'echo compiled a' },
            },
        });
        await writeJson(Path.join(root, 'packages/b/project.json'), {
            name: 'b',
            implicitDependencies: ['a'],
            targets: {
                compile: { command: 'echo compiled b' },
            },
        });

        const nx = async (...args: string[]): Promise<string> => {
            const { stdout } = await execFileAsync(process.execPath, [nxBin, ...args], {
                cwd: root,
                env,
            });
            return stdout;
        };

        return { root, nx };
    });

    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    suite('plugin', () => {
        const withPlugin = withWorkspace.beforeEach(async ({ root }) => {
            await writeJson(Path.join(root, 'nx.json'), {
                plugins: [{ plugin: 'nx-lifecycle/plugin', options: { stages, bindings } }],
            });
        });

        withPlugin.test('Infers lifecycle targets', async function (this: Context, { nx }) {
            this.timeout(60_000);

            const project = JSON.parse(await nx('show', 'project', 'b', '--json')) as {
                targets: Record<string, { executor: string; dependsOn?: unknown[] }>;
            };

            expect(project.targets['build:_']).to.include({ executor: 'nx:noop' });
            expect(project.targets['build:_']!.dependsOn).to.deep.equal(['^build']);
            expect(project.targets['build:run']!.dependsOn).to.deep.equal(['build:_', 'compile']);
            expect(project.targets.build!.dependsOn).to.deep.equal(['build:run']);
            expect(project.targets.compile!.dependsOn).to.deep.equal(['build:_']);
        });

        withPlugin.test('Runs stages in order', async function (this: Context, { nx }) {
            this.timeout(60_000);

            // Outside a terminal, Nx hides the output of successful dependency tasks unless static
            const output = await nx('run', 'b:build', '--outputStyle=static');

            expect(output).to.contain('compiled a');
            expect(output).to.contain('compiled b');
            expect(output.indexOf('compiled a')).to.be.lessThan(output.indexOf('compiled b'));
        });

        withPlugin.test(
            'Fails when targetDefaults replace the wiring',
            async function (this: Context, { root, nx }) {
                this.timeout(60_000);

                await writeJson(Path.join(root, 'nx.json'), {
                    plugins: [{ plugin: 'nx-lifecycle/plugin', options: { stages, bindings } }],
                    targetDefaults: {
                        compile: { dependsOn: [] },
                    },
                });

                const thrown: unknown = await expect(
                    nx('show', 'project', 'b', '--json')
                ).to.be.rejectedWith(Error);

                expect(thrown)
                    .to.have.property('stderr')
                    .that.includes(
                        'compile is bound to build:run, so it must depend on build:_. A dependsOn in project.json or nx.json targetDefaults replaces the inferred one, so add "build:_" to it'
                    );
            }
        );
    });

    withWorkspace.test(
        'Executor writes lifecycle targets',
        async function (this: Context, { root, nx }) {
            this.timeout(60_000);

            await writeJson(Path.join(root, 'nx.json'), {});
            await writeJson(Path.join(root, 'project.json'), {
                name: 'workspace',
                targets: {
                    lifecycle: {
                        executor: 'nx-lifecycle:lifecycle',
                        options: { stages, bindings, check: false },
                    },
                },
            });

            await nx('run', 'workspace:lifecycle');

            const nxJson = JSON.parse(await readFile(Path.join(root, 'nx.json'), 'utf8')) as {
                targetDefaults: Record<string, { dependsOn?: unknown[] }>;
            };
            expect(nxJson.targetDefaults.compile!.dependsOn).to.deep.equal(['build:_']);
            expect(nxJson.targetDefaults['build:run']!.dependsOn).to.deep.equal([
                'build:_',
                'compile',
            ]);

            const projectJson = JSON.parse(
                await readFile(Path.join(root, 'packages/a/project.json'), 'utf8')
            ) as { targets: Record<string, unknown> };
            expect(projectJson.targets).to.have.keys('compile', 'build:_', 'build:run', 'build');
        }
    );

    suite('cli', () => {
        const withConfig = withWorkspace.beforeEach(async ({ root }) => {
            await writeJson(Path.join(root, 'nx.json'), {});
            await writeJson(Path.join(root, 'lifecycle.json'), { stages, bindings });

            const lifecycle = async (
                ...args: string[]
            ): Promise<{ stdout: string; stderr: string }> =>
                execFileAsync(process.execPath, [Path.join(packageRoot, 'bin.mjs'), ...args], {
                    cwd: root,
                    env,
                });

            return { lifecycle };
        });

        withConfig.test(
            'Writes lifecycle targets for the project graph',
            async function (this: Context, { root, lifecycle }) {
                this.timeout(60_000);

                await lifecycle('--ci=false');

                const projectJson = JSON.parse(
                    await readFile(Path.join(root, 'packages/b/project.json'), 'utf8')
                ) as { targets: Record<string, unknown> };
                expect(projectJson.targets).to.have.keys(
                    'compile',
                    'build:_',
                    'build:run',
                    'build'
                );
            }
        );

        withConfig.test(
            'Check fails when files are out of date',
            async function (this: Context, { root, lifecycle }) {
                this.timeout(60_000);

                const thrown: unknown = await expect(lifecycle('--check')).to.be.rejectedWith(
                    Error
                );

                expect(thrown)
                    .to.have.property('stderr')
                    .that.includes(`File ${Path.join(root, 'nx.json')} is not up to date`);
            }
        );
    });
});

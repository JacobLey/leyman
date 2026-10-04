import type { Context } from 'mocha';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { stub, verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import lifecycle from '#internal/executors/lifecycle/index.js';

const stages = {
    build: {
        hooks: ['run'],
    },
};
const bindings = {
    compile: 'build:run',
};

const writeJson = async (path: string, data: unknown): Promise<void> => {
    await mkdir(Path.dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data));
};

const readJson = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(path, 'utf8')) as unknown;

suite('lifecycle executor', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        // Formatting written files runs the real formatter
        this.timeout(10_000);

        const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-lifecycle-executor-'));
        const nxJsonPath = Path.join(root, 'nx.json');
        const projectJsonPath = Path.join(root, 'packages/a/project.json');

        await writeJson(nxJsonPath, {});
        await writeJson(projectJsonPath, {
            name: 'a',
            targets: { compile: {} },
        });

        const context = {
            root,
            projectsConfigurations: {
                version: 2,
                projects: {
                    a: { name: 'a', root: 'packages/a' },
                },
            },
        };

        return {
            root,
            nxJsonPath,
            projectJsonPath,
            context,
            // Console output is part of the contract, and keeps test output clean
            info: stub(console, 'info'),
            warn: stub(console, 'warn'),
        };
    });

    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('Options provided directly', () => {
        withWorkspace.test('Writes lifecycle targets', async function (this: Context, ctx) {
            this.timeout(10_000);

            expect(await lifecycle({ stages, bindings, check: false }, ctx.context)).to.deep.equal({
                success: true,
            });

            expect(await readJson(ctx.nxJsonPath)).to.have.deep.nested.property(
                'targetDefaults.compile.dependsOn',
                ['build:_']
            );
            expect(await readJson(ctx.projectJsonPath))
                .to.have.property('targets')
                .that.has.keys('compile', 'build:_', 'build:run', 'build');
            expect(ctx.info.calledWith(`Updating ${ctx.projectJsonPath}`)).to.equal(true);
        });

        withWorkspace.test(
            'Leaves up to date files untouched',
            async function (this: Context, ctx) {
                this.timeout(10_000);

                await lifecycle({ stages, bindings, check: false }, ctx.context);
                const before = await stat(ctx.projectJsonPath);

                await lifecycle({ stages, bindings, check: false }, ctx.context);

                const after = await stat(ctx.projectJsonPath);
                expect(after.mtimeMs).to.equal(before.mtimeMs);
            }
        );

        withWorkspace.test(
            'Defaults pass when files are up to date',
            async function (this: Context, ctx) {
                this.timeout(10_000);

                await lifecycle({ stages, bindings, check: false }, ctx.context);

                // Check defaults to CI, which only fails if files are out of date
                expect(await lifecycle({ stages, bindings }, ctx.context)).to.deep.equal({
                    success: true,
                });
            }
        );

        withWorkspace.test('Dry run does not write files', async ctx => {
            const before = await readFile(ctx.projectJsonPath, 'utf8');

            await lifecycle({ stages, bindings, check: false, dryRun: true }, ctx.context);

            expect(await readFile(ctx.projectJsonPath, 'utf8')).to.equal(before);
        });

        withWorkspace.test('Check fails when files are out of date', async ctx => {
            const before = await readFile(ctx.projectJsonPath, 'utf8');

            await expect(
                lifecycle({ stages, bindings, check: true }, ctx.context)
            ).to.be.rejectedWith(Error, `File ${ctx.nxJsonPath} is not up to date`);

            expect(await readFile(ctx.projectJsonPath, 'utf8')).to.equal(before);
        });

        withWorkspace.test('Warns about bindings no project declares', async ctx => {
            await lifecycle(
                {
                    stages,
                    bindings: { ...bindings, typo: 'build:run' },
                    check: false,
                    dryRun: true,
                },
                ctx.context
            );

            expect(ctx.warn.callCount).to.equal(1);
            expect(
                ctx.warn.calledWith(
                    'Bound target typo is not declared in any project.json. Is it a typo?'
                )
            ).to.equal(true);
        });

        withWorkspace.test('Warns about bindings when no project has targets', async ctx => {
            await writeJson(ctx.projectJsonPath, { name: 'a' });

            await lifecycle({ stages, bindings, check: false, dryRun: true }, ctx.context);

            expect(
                ctx.warn.calledWith(
                    'Bound target compile is not declared in any project.json. Is it a typo?'
                )
            ).to.equal(true);
        });

        withWorkspace.test('Fails on invalid nx.json', async ctx => {
            await writeJson(ctx.nxJsonPath, { targetDefaults: 123 });

            await expect(
                lifecycle({ stages, bindings, check: false }, ctx.context)
            ).to.be.rejectedWith(Error, 'Failed to parse nx.json');
        });

        withWorkspace.test('Fails on invalid project.json', async ctx => {
            await writeJson(ctx.projectJsonPath, { targets: 123 });

            await expect(
                lifecycle({ stages, bindings, check: false }, ctx.context)
            ).to.be.rejectedWith(Error, `Failed to parse ${ctx.projectJsonPath}`);
        });
    });

    suite('Options loaded from config file', () => {
        withWorkspace.test('Defaults to lifecycle.json', async function (this: Context, ctx) {
            this.timeout(10_000);

            await writeJson(Path.join(ctx.root, 'lifecycle.json'), { stages, bindings });

            await lifecycle({ cwd: ctx.root, check: false }, ctx.context);

            expect(await readJson(ctx.projectJsonPath))
                .to.have.property('targets')
                .that.has.keys('compile', 'build:_', 'build:run', 'build');
        });

        withWorkspace.test('Options override config file', async ctx => {
            await writeJson(Path.join(ctx.root, 'custom.json'), {
                stages,
                bindings,
                check: true,
            });

            await lifecycle(
                { cwd: ctx.root, configFile: 'custom.json', check: false, dryRun: true },
                ctx.context
            );
        });

        withWorkspace.test('Fails on invalid config', async ctx => {
            await writeJson(Path.join(ctx.root, 'lifecycle.json'), {});

            await expect(lifecycle({ cwd: ctx.root }, ctx.context)).to.be.rejectedWith(
                Error,
                `Invalid config loaded from ${Path.join(ctx.root, 'lifecycle.json')}`
            );
        });
    });
});

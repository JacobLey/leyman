import type { readFile as ReadFile } from 'node:fs/promises';
import type { ProjectGraph } from '@nx/devkit';
import { verifyAndRestore } from 'sinon';
import type { AsyncSupplier } from 'haywire';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import type { ParseCwd } from '../../../commands/lib/dependencies.js';
import { UpdateTsReferencesCommand } from '../../../commands/update-ts-references-command.js';
import type { IUpdateTsReferences } from '../../../lib/update-ts-references.js';
import { expect } from '../../chai-hooks.js';

suite('UpdateTsReferencesCommand', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedUpdateTsReferences = stubMethod<IUpdateTsReferences>();
        const stubbedParseCwd = stubMethod<ParseCwd>();
        const stubbedGetProjectGraph = stubMethod<AsyncSupplier<ProjectGraph>>();
        const stubbedReadFile = stubMethod<typeof ReadFile>();
        return {
            stubbedUpdateTsReferences: stubbedUpdateTsReferences.stub,
            stubbedParseCwd: stubbedParseCwd.stub,
            stubbedGetProjectGraph: stubbedGetProjectGraph.stub,
            stubbedReadFile: stubbedReadFile.stub,
            updateTsReferencesCommand: new UpdateTsReferencesCommand(
                stubbedUpdateTsReferences.method,
                stubbedParseCwd.method,
                stubbedGetProjectGraph.method,
                stubbedReadFile.method
            ),
        };
    });

    suite('handler', () => {
        withStubs.test('success', async ctx => {
            ctx.stubbedParseCwd
                .withArgs('<raw-package-root>')
                .resolves('/package/root/path/to/projectName');

            ctx.stubbedGetProjectGraph.resolves({
                dependencies: {
                    projectName: [
                        {
                            type: '<ignore>',
                            target: 'dependency1',
                            source: '<source>',
                        },
                        {
                            type: '<ignore>',
                            target: 'dependency2',
                            source: '<source>',
                        },
                        {
                            type: '<ignore>',
                            target: 'dependency3',
                            source: '<source>',
                        },
                    ],
                },
                nodes: {
                    projectName: {
                        type: 'app',
                        name: 'projectName',
                        data: {
                            root: 'path/to/projectName',
                        },
                    },
                    dependency1: {
                        type: 'lib',
                        name: 'dependency1',
                        data: {
                            root: 'path/to/dependency-1',
                        },
                    },
                    dependency2: {
                        type: 'lib',
                        name: 'dependency2',
                        data: {
                            root: 'path/to/dependency/2',
                        },
                    },
                },
            });

            ctx.stubbedReadFile
                .withArgs('/package/root/path/to/projectName/project.json', 'utf8')
                .resolves(
                    JSON.stringify({
                        name: 'projectName',
                    })
                );

            ctx.stubbedUpdateTsReferences.resolves(true);

            await ctx.updateTsReferencesCommand.handler({
                packageRoot: '<raw-package-root>',
                ci: false,
                dryRun: true,
            });

            expect(ctx.stubbedUpdateTsReferences.getCall(0).args).to.deep.equal([
                {
                    dependencyRootPaths: [
                        '/package/root/path/to/dependency-1/tsconfig.json',
                        '/package/root/path/to/dependency/2/tsconfig.json',
                    ],
                    dryRun: true,
                    tsConfigPath: '/package/root/path/to/projectName/tsconfig.json',
                },
            ]);
        });

        withStubs.test('Empty dependencies', async ctx => {
            ctx.stubbedParseCwd.resolves('/package/root/path/to/projectName');

            ctx.stubbedGetProjectGraph.resolves({
                dependencies: {
                    projectName: [],
                },
                nodes: {
                    projectName: {
                        type: 'app',
                        name: 'projectName',
                        data: {
                            root: 'path/to/projectName',
                        },
                    },
                },
            });

            ctx.stubbedReadFile.resolves(
                JSON.stringify({
                    name: 'projectName',
                })
            );

            ctx.stubbedUpdateTsReferences.resolves(false);

            await ctx.updateTsReferencesCommand.handler({
                packageRoot: '<raw-package-root>',
                ci: false,
                dryRun: false,
            });

            expect(ctx.stubbedUpdateTsReferences.getCall(0).args).to.deep.equal([
                {
                    dependencyRootPaths: [],
                    dryRun: false,
                    tsConfigPath: '/package/root/path/to/projectName/tsconfig.json',
                },
            ]);
        });

        withStubs.test('Fails when changed and CI', async ctx => {
            ctx.stubbedParseCwd.resolves('/package/root/path/to/projectName');

            ctx.stubbedGetProjectGraph.resolves({
                dependencies: {
                    projectName: [
                        {
                            type: '<ignore>',
                            target: 'dependency1',
                            source: '<source>',
                        },
                    ],
                },
                nodes: {
                    projectName: {
                        type: 'app',
                        name: 'projectName',
                        data: {
                            root: 'path/to/projectName',
                        },
                    },
                    dependency1: {
                        type: 'lib',
                        name: 'dependency1',
                        data: {
                            root: 'path/to/dependency-1',
                        },
                    },
                },
            });

            ctx.stubbedReadFile.resolves(
                JSON.stringify({
                    name: 'projectName',
                })
            );

            ctx.stubbedUpdateTsReferences.resolves(true);

            await expect(
                ctx.updateTsReferencesCommand.handler({
                    packageRoot: '<raw-package-root>',
                    ci: true,
                    dryRun: false,
                })
            ).to.eventually.be.rejectedWith(Error, 'tsconfig.json is not built');

            expect(ctx.stubbedUpdateTsReferences.getCall(0).args).to.deep.equal([
                {
                    dependencyRootPaths: ['/package/root/path/to/dependency-1/tsconfig.json'],
                    dryRun: true,
                    tsConfigPath: '/package/root/path/to/projectName/tsconfig.json',
                },
            ]);
        });

        withStubs.test('Fails when project.json cannot be loaded', async ctx => {
            ctx.stubbedParseCwd.resolves('/package/root/path/to/projectName');

            ctx.stubbedGetProjectGraph.resolves({
                dependencies: {
                    projectName: [
                        {
                            type: '<ignore>',
                            target: 'dependency1',
                            source: '<source>',
                        },
                    ],
                },
                nodes: {
                    projectName: {
                        type: 'app',
                        name: 'projectName',
                        data: {
                            root: 'path/to/projectName',
                        },
                    },
                    dependency1: {
                        type: 'lib',
                        name: 'dependency1',
                        data: {
                            root: 'path/to/dependency-1',
                        },
                    },
                },
            });

            ctx.stubbedReadFile.resolves(
                JSON.stringify({
                    ignore: true,
                })
            );

            await expect(
                ctx.updateTsReferencesCommand.handler({
                    packageRoot: '<raw-package-root>',
                    ci: false,
                    dryRun: false,
                })
            ).to.eventually.be.rejectedWith(Error, 'Cannot parse project.json name');
        });
    });
});

import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { NxUpdateTsReferencesExecutor } from '../../../../executors/update-ts-references/executor.js';
import type { IUpdateTsReferences } from '../../../../lib/update-ts-references.js';
import { expect } from '../../../chai-hooks.js';

suite('NxUpdateTsReferencesExecutor', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedUpdateTsReferences = stubMethod<IUpdateTsReferences>();
        const stubbedLogger = stubMethod<typeof console.error>();
        return {
            stubbedUpdateTsReferences: stubbedUpdateTsReferences.stub,
            stubbedLogger: stubbedLogger.stub,
            executor: new NxUpdateTsReferencesExecutor(
                true,
                stubbedUpdateTsReferences.method,
                stubbedLogger.method
            ).execute,
        };
    });

    withStubs.test('success', async ctx => {
        ctx.stubbedUpdateTsReferences.resolves(true);

        expect(
            await ctx.executor(
                { check: false, dryRun: false },
                {
                    projectName: 'projectName',
                    root: '/path/to/workspace',
                    projectsConfigurations: {
                        projects: {},
                        version: 123,
                    },
                    projectGraph: {
                        dependencies: {
                            projectName: [
                                {
                                    type: 'lib',
                                    target: 'dependency1',
                                    source: '<source>',
                                },
                                {
                                    type: 'lib',
                                    target: 'dependency2',
                                    source: '<source>',
                                },
                            ],
                            dependency1: [
                                {
                                    type: 'lib',
                                    target: '<ignore>',
                                    source: '<source>',
                                },
                            ],
                        },
                        nodes: {
                            projectName: {
                                type: 'app',
                                name: 'projectName',
                                data: {
                                    root: '/path/to/package-name',
                                },
                            },
                            dependency1: {
                                type: 'lib',
                                name: 'dependency1',
                                data: {
                                    root: '/path/to/dependency-1',
                                },
                            },
                            dependency2: {
                                type: 'lib',
                                name: 'dependency1',
                                data: {
                                    root: '/path/to/dependency/2',
                                },
                            },
                            ignore: {
                                type: 'lib',
                                name: 'ignore',
                                data: {
                                    root: '<ignore>',
                                },
                            },
                        },
                    },
                    nxJsonConfiguration: {},
                    cwd: '<cwd>',
                    isVerbose: false,
                }
            )
        ).to.deep.equal({ success: true });

        expect(ctx.stubbedUpdateTsReferences.getCall(0).args).to.deep.equal([
            {
                tsConfigPath: '/path/to/workspace/path/to/package-name/tsconfig.json',
                dependencyRootPaths: [
                    '/path/to/workspace/path/to/dependency-1/tsconfig.json',
                    '/path/to/workspace/path/to/dependency/2/tsconfig.json',
                ],
                dryRun: false,
            },
        ]);
        expect(ctx.stubbedLogger.called).to.equal(false);
    });

    withStubs.test('Options are optional', async ctx => {
        ctx.stubbedUpdateTsReferences.resolves(false);

        expect(
            await ctx.executor(
                {},
                {
                    projectName: 'projectName',
                    root: '/path/to/workspace',
                    projectsConfigurations: {
                        projects: {},
                        version: 123,
                    },
                    projectGraph: {
                        dependencies: {
                            projectName: [
                                {
                                    type: 'lib',
                                    target: 'dependency1',
                                    source: '<source>',
                                },
                                {
                                    type: 'lib',
                                    target: 'dependency2',
                                    source: '<source>',
                                },
                            ],
                        },
                        nodes: {
                            projectName: {
                                type: 'app',
                                name: 'projectName',
                                data: {
                                    root: '/path/to/package-name',
                                },
                            },
                            dependency1: {
                                type: 'lib',
                                name: 'dependency1',
                                data: {
                                    root: '/path/to/dependency-1',
                                },
                            },
                        },
                    },
                    nxJsonConfiguration: {},
                    cwd: '<cwd>',
                    isVerbose: false,
                }
            )
        ).to.deep.equal({ success: true });

        expect(ctx.stubbedUpdateTsReferences.getCall(0).args).to.deep.equal([
            {
                tsConfigPath: '/path/to/workspace/path/to/package-name/tsconfig.json',
                dependencyRootPaths: ['/path/to/workspace/path/to/dependency-1/tsconfig.json'],
                dryRun: true,
            },
        ]);
        expect(ctx.stubbedLogger.called).to.equal(false);
    });

    withStubs.test('Fails when changes occur during check', async ctx => {
        ctx.stubbedUpdateTsReferences.resolves(true);

        expect(
            await ctx.executor(
                { check: true, dryRun: true },
                {
                    projectName: 'projectName',
                    root: '/path/to/workspace',
                    projectsConfigurations: {
                        projects: {},
                        version: 123,
                    },
                    projectGraph: {
                        dependencies: {
                            projectName: [
                                {
                                    type: 'lib',
                                    target: 'dependency1',
                                    source: '<source>',
                                },
                                {
                                    type: 'lib',
                                    target: 'dependency2',
                                    source: '<source>',
                                },
                            ],
                        },
                        nodes: {
                            projectName: {
                                type: 'app',
                                name: 'projectName',
                                data: {
                                    root: '/path/to/package-name',
                                },
                            },
                            dependency1: {
                                type: 'lib',
                                name: 'dependency1',
                                data: {
                                    root: '/path/to/dependency-1',
                                },
                            },
                        },
                    },
                    nxJsonConfiguration: {},
                    cwd: '<cwd>',
                    isVerbose: false,
                }
            )
        ).to.deep.equal({ success: false });

        expect(ctx.stubbedUpdateTsReferences.getCall(0).args).to.deep.equal([
            {
                tsConfigPath: '/path/to/workspace/path/to/package-name/tsconfig.json',
                dependencyRootPaths: ['/path/to/workspace/path/to/dependency-1/tsconfig.json'],
                dryRun: true,
            },
        ]);
        expect(ctx.stubbedLogger.getCall(0).args).to.deep.equal(['tsconfig.json is out of date']);
    });
});

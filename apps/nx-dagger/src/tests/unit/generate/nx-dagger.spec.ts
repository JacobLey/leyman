import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite, test } from 'mocha-chain';
import type { PopulateFile } from 'populate-files';
import { stubMethod } from 'sinon-typed-stub';
import type { GetGitIgnore } from '../../../generate/git-ignore.js';
import type { GenerateGoFile } from '../../../generate/go-generator.js';
import type { TemplateContext } from '../../../generate/lib/types.js';
import type { NormalizeOptions } from '../../../generate/normalizer.js';
import * as NxDagger from '../../../generate/nx-dagger.js';
import { expect } from '../../chai-hooks.js';

suite('NxDagger', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    suite('constructContext', () => {
        test('Computes project and target order', () => {
            expect(
                NxDagger.constructContext({
                    constructorArguments: {
                        fooArg: 'string',
                        barArg: 'int',
                    },
                    dagger: {
                        name: '<dagger-name>',
                        directory: '<directory>',
                    },
                    gitIgnore: ['ignore', 'stuff/**', '!allowed'],
                    runtimes: {
                        node: {
                            preBuild: {
                                name: 'node-install',
                                constructorArguments: ['fooArg'],
                                parameters: ['projectSource'],
                            },
                            postBuild: {
                                name: 'NodeDeploy',
                                constructorArguments: ['barArg'],
                                parameters: ['projectOutput'],
                            },
                        },
                    },
                    targets: {
                        tsc: {
                            pluginNames: ['build'],
                            constructorArguments: ['fooArg'],
                            kind: 'transform',
                            parameters: ['source', 'output'],
                        },
                        test: {
                            constructorArguments: ['fooArg', 'barArg'],
                            kind: 'ci',
                            parameters: ['projectDir', 'dependencyProjectDirectories'],
                        },
                    },
                    projectGraph: {
                        nodes: {
                            a: {
                                data: {
                                    root: 'path/to/a',
                                    metadata: {
                                        daggerRuntime: 'node',
                                    },
                                    targets: {
                                        build: {},
                                        test: {
                                            dependsOn: [],
                                        },
                                    },
                                },
                            },
                            b: {
                                data: {
                                    root: 'path/to/b',
                                    metadata: {
                                        daggerRuntime: 'node',
                                    },
                                    targets: {
                                        differentBuild: {
                                            dependsOn: ['ignore', '^build', '^test'],
                                        },
                                        test: {
                                            dependsOn: [
                                                {
                                                    target: 'ignore',
                                                },
                                                {
                                                    target: 'build',
                                                },
                                                {
                                                    projects: [],
                                                    target: 'test',
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                            c: {
                                data: {
                                    root: 'path/to/c',
                                    metadata: {
                                        daggerRuntime: 'node',
                                    },
                                    targets: {
                                        build: {
                                            dependsOn: [
                                                {
                                                    dependencies: false,
                                                    target: 'test',
                                                },
                                            ],
                                        },
                                        test: {
                                            dependsOn: [
                                                {
                                                    dependencies: true,
                                                    target: 'build',
                                                },
                                                {
                                                    projects: [],
                                                    target: 'ignore',
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                            d: {
                                data: {
                                    root: 'path/to/d',
                                    metadata: {
                                        daggerRuntime: 'node',
                                    },
                                    targets: {
                                        build: {
                                            dependsOn: ['^test'],
                                        },
                                        test: {
                                            dependsOn: ['^build'],
                                        },
                                        other: {
                                            dependsOn: ['noop'],
                                        },
                                    },
                                },
                            },
                            ignore: {
                                data: {
                                    root: '<ignore>',
                                    metadata: {},
                                },
                            },
                        },
                        dependencies: {
                            a: [{ target: '<external>' }],
                            b: [{ target: 'a' }],
                            c: [{ target: 'b' }, { target: 'external' }],
                            d: [{ target: 'c' }, { target: 'npm:b' }, { target: 'a' }],
                            ignore: [],
                        },
                    },
                })
            ).to.deep.equal({
                constructorArguments: new Map([
                    [
                        'fooArg',
                        {
                            name: 'fooArg',
                            type: 'string',
                        },
                    ],
                    [
                        'barArg',
                        {
                            name: 'barArg',
                            type: 'int',
                        },
                    ],
                ]),
                dagger: {
                    name: '<dagger-name>',
                    directory: '<directory>',
                },
                gitIgnore: ['ignore', 'stuff/**', '!allowed'],
                runtimes: new Map([
                    [
                        'node',
                        {
                            name: 'node',
                            preBuild: {
                                name: 'node-install',
                                constructorArguments: ['fooArg'],
                                parameters: ['projectSource'],
                            },
                            postBuild: {
                                name: 'NodeDeploy',
                                constructorArguments: ['barArg'],
                                parameters: ['projectOutput'],
                            },
                        },
                    ],
                ]),
                projects: new Map([
                    [
                        'a',
                        {
                            name: 'a',
                            directory: 'path/to/a',
                            runtime: 'node',
                            targets: ['tsc', 'test'],
                            dependencies: [],
                            directDependencies: [],
                        },
                    ],
                    [
                        'b',
                        {
                            name: 'b',
                            directory: 'path/to/b',
                            runtime: 'node',
                            targets: ['test'],
                            dependencies: ['a'],
                            directDependencies: ['a'],
                        },
                    ],
                    [
                        'c',
                        {
                            name: 'c',
                            directory: 'path/to/c',
                            runtime: 'node',
                            targets: ['test', 'tsc'],
                            dependencies: ['a', 'b'],
                            directDependencies: ['b'],
                        },
                    ],
                    [
                        'd',
                        {
                            name: 'd',
                            directory: 'path/to/d',
                            runtime: 'node',
                            targets: ['tsc', 'test'],
                            dependencies: ['a', 'b', 'c'],
                            directDependencies: ['a', 'c'],
                        },
                    ],
                ]),
                targets: new Map([
                    [
                        'tsc',
                        {
                            name: 'tsc',
                            constructorArguments: ['fooArg'],
                            isCi: false,
                            parameters: ['source', 'output'],
                        },
                    ],
                    [
                        'test',
                        {
                            name: 'test',
                            constructorArguments: ['fooArg', 'barArg'],
                            isCi: true,
                            parameters: ['projectDir', 'dependencyProjectDirectories'],
                        },
                    ],
                ]),
            } satisfies TemplateContext);
        });
    });

    suite('nxDagger', () => {
        const stubs = beforeEach(() => {
            const stubbedGetGitIgnore = stubMethod<GetGitIgnore>();
            const stubbedNormalizeOptions = stubMethod<NormalizeOptions>();
            const stubbedGenerateGoFile = stubMethod<GenerateGoFile>();
            const stubbedPopulateFile = stubMethod<PopulateFile>();

            return {
                stubbedGetGitIgnore: stubbedGetGitIgnore.stub,
                stubbedNormalizeOptions: stubbedNormalizeOptions.stub,
                stubbedGenerateGoFile: stubbedGenerateGoFile.stub,
                stubbedPopulateFile: stubbedPopulateFile.stub,
                nxDagger: NxDagger.nxDaggerProvider(
                    '<workspace-root>',
                    stubbedGetGitIgnore.method,
                    stubbedNormalizeOptions.method,
                    stubbedGenerateGoFile.method,
                    stubbedPopulateFile.method
                ),
            };
        });

        stubs.test('Generate file and write', async ctx => {
            ctx.stubbedGetGitIgnore.resolves(['<git-ignore>']);
            ctx.stubbedNormalizeOptions.withArgs({}).resolves({
                check: true,
                dryRun: false,
                constructorArguments: {},
                dagger: {
                    name: '<dagger-monorepo>',
                    directory: '<dagger-directory>',
                },
                runtimes: {},
                targets: {},
            });
            ctx.stubbedGenerateGoFile.resolves('<go-file>');
            ctx.stubbedPopulateFile.resolves();

            await ctx.nxDagger(
                {
                    nodes: {},
                    dependencies: {},
                },
                {}
            );

            expect(ctx.stubbedGenerateGoFile.callCount).to.equal(1);
            expect(ctx.stubbedGenerateGoFile.getCall(0).args).to.deep.equal([
                {
                    constructorArguments: new Map(),
                    dagger: {
                        directory: '<dagger-directory>',
                        name: '<dagger-monorepo>',
                    },
                    gitIgnore: ['<git-ignore>'],
                    projects: new Map(),
                    runtimes: new Map(),
                    targets: new Map(),
                },
            ]);
            expect(ctx.stubbedPopulateFile.callCount).to.equal(1);
            expect(ctx.stubbedPopulateFile.getCall(0).args).to.deep.equal([
                {
                    filePath: '<workspace-root>/<dagger-directory>/main.go',
                    content: '<go-file>',
                },
                {
                    check: true,
                    dryRun: false,
                },
            ]);
        });
    });
});

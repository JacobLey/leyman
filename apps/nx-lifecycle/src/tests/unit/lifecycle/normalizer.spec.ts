import type { readFile as ReadFile } from 'node:fs/promises';
import { beforeEach, suite } from 'mocha-chain';
import type { ParseCwd } from 'parse-cwd';
import { stubMethod } from 'sinon-typed-stub';
import { Normalizer } from '../../../lifecycle/normalizer.js';
import type { LifecycleOptions } from '../../../lifecycle/schema.js';
import { expect } from '../../chai-hooks.js';

suite('Normalizer', () => {
    const stubs = beforeEach(() => {
        const stubbedIsCi = stubMethod<() => boolean>();
        const stubbedParseCwd = stubMethod<ParseCwd>();
        const stubbedReadFile = stubMethod<typeof ReadFile>();

        return {
            stubbedIsCi: stubbedIsCi.stub,
            stubbedParseCwd: stubbedParseCwd.stub,
            stubbedReadFile: stubbedReadFile.stub,
            normalizer: new Normalizer(
                stubbedIsCi.method,
                stubbedParseCwd.method,
                stubbedReadFile.method
            ),
        };
    });

    suite('normalizeOptions', () => {
        stubs.test('Use provided options', async ctx => {
            expect(
                await ctx.normalizer.normalizeOptions(
                    {
                        check: false,
                        dryRun: true,
                        stages: {
                            myStage: {},
                        },
                        bindings: {
                            myTarget: 'myStage',
                        },
                    },
                    {
                        root: '/path/to/workspace',
                        projects: [
                            {
                                name: 'myFoo',
                                root: 'path/to/foo',
                            },
                            {
                                name: 'myBar',
                                root: 'path/to/bar',
                            },
                        ],
                    }
                )
            ).to.deep.equal({
                check: false,
                dryRun: true,
                nxJsonPath: '/path/to/workspace/nx.json',
                packageJsonPaths: [
                    {
                        name: 'myFoo',
                        path: '/path/to/workspace/path/to/foo/project.json',
                    },
                    {
                        name: 'myBar',
                        path: '/path/to/workspace/path/to/bar/project.json',
                    },
                ],
                stages: {
                    myStage: {},
                },
                bindings: {
                    myTarget: 'myStage',
                },
            });

            expect(ctx.stubbedIsCi.called).to.equal(false);
            expect(ctx.stubbedParseCwd.called).to.equal(false);
            expect(ctx.stubbedReadFile.called).to.equal(false);
        });

        stubs.test('Load from config', async ctx => {
            ctx.stubbedParseCwd.resolves('<parsed-cwd>');
            ctx.stubbedReadFile.resolves(
                JSON.stringify({
                    check: false,
                    dryRun: true,
                    stages: {
                        myStage: {},
                    },
                    bindings: {
                        myTarget: 'myStage',
                    },
                } satisfies LifecycleOptions)
            );

            expect(
                await ctx.normalizer.normalizeOptions(
                    {
                        cwd: '<cwd>',
                        configFile: '<config-file>',
                    },
                    {
                        root: '/path/to/workspace',
                        projects: [
                            {
                                name: 'myFoo',
                                root: 'path/to/foo',
                            },
                        ],
                    }
                )
            ).to.deep.equal({
                check: false,
                dryRun: true,
                nxJsonPath: '/path/to/workspace/nx.json',
                packageJsonPaths: [
                    {
                        name: 'myFoo',
                        path: '/path/to/workspace/path/to/foo/project.json',
                    },
                ],
                stages: {
                    myStage: {},
                },
                bindings: {
                    myTarget: 'myStage',
                },
            });

            expect(ctx.stubbedIsCi.called).to.equal(false);
            expect(ctx.stubbedParseCwd.callCount).to.equal(1);
            expect(ctx.stubbedParseCwd.getCall(0).args).to.deep.equal(['<cwd>']);
            expect(ctx.stubbedReadFile.callCount).to.equal(1);
            expect(ctx.stubbedReadFile.getCall(0).args).to.deep.equal([
                '<parsed-cwd>/<config-file>',
                'utf8',
            ]);
        });

        stubs.test('Use defaults', async ctx => {
            ctx.stubbedIsCi.returns(false);
            ctx.stubbedParseCwd.resolves('<parsed-cwd>');
            ctx.stubbedReadFile.resolves(
                JSON.stringify({
                    stages: {},
                    bindings: {},
                } satisfies LifecycleOptions)
            );

            expect(
                await ctx.normalizer.normalizeOptions(
                    {},
                    {
                        root: '/path/to/workspace',
                        projects: [
                            {
                                name: 'myFoo',
                                root: 'path/to/foo',
                            },
                        ],
                    }
                )
            ).to.deep.equal({
                check: false,
                dryRun: false,
                nxJsonPath: '/path/to/workspace/nx.json',
                packageJsonPaths: [
                    {
                        name: 'myFoo',
                        path: '/path/to/workspace/path/to/foo/project.json',
                    },
                ],
                stages: {},
                bindings: {},
            });

            expect(ctx.stubbedIsCi.callCount).to.equal(1);
            expect(ctx.stubbedParseCwd.callCount).to.equal(1);
            expect(ctx.stubbedReadFile.callCount).to.equal(1);
            expect(ctx.stubbedReadFile.getCall(0).args).to.deep.equal([
                '<parsed-cwd>/lifecycle.json',
                'utf8',
            ]);
        });

        stubs.test('Loaded config does not match schema', async ctx => {
            ctx.stubbedParseCwd.resolves('<parsed-cwd>');
            ctx.stubbedReadFile.resolves(JSON.stringify({}));

            await expect(
                ctx.normalizer.normalizeOptions(
                    {},
                    {
                        root: '/path/to/workspace',
                        projects: [],
                    }
                )
            ).to.eventually.be.rejectedWith(
                Error,
                `Invalid config loaded from <parsed-cwd>/lifecycle.json`
            );
        });
    });
});

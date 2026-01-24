import type { readFile as ReadFile } from 'node:fs/promises';
import type { ParseCwd } from 'parse-cwd';
import type { DaggerOptions } from '../../../generate/schema.js';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Normalizer } from '../../../generate/normalizer.js';
import { expect } from '../../chai-hooks.js';

suite('Normalizer', () => {
    afterEach(() => {
        verifyAndRestore();
    });

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
            const input: DaggerOptions = {
                check: false,
                dryRun: true,
                constructorArguments: {
                    nodeVersion: 'string',
                },
                dagger: {
                    name: '<dagger-name>',
                    directory: '<directory>',
                },
                runtimes: {
                    node: {
                        preBuild: {
                            name: '<node-prebuild>',
                            constructorArguments: [],
                            parameters: ['source'],
                        },
                        postBuild: {
                            name: '<node-prebuild>',
                            constructorArguments: [],
                            parameters: [],
                        },
                    },
                },
                targets: {
                    build: {
                        constructorArguments: ['nodeVersion'],
                        kind: 'transform',
                        parameters: ['output'],
                    },
                },
            };
            expect(await ctx.normalizer.normalizeOptions(input)).to.deep.equal(input);

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
                    constructorArguments: {},
                    dagger: {
                        name: '<dagger-name>',
                        directory: '<directory>',
                    },
                    runtimes: {},
                    targets: {},
                } satisfies DaggerOptions)
            );

            expect(
                await ctx.normalizer.normalizeOptions({
                    cwd: '<cwd>',
                    configFile: '<config-file>',
                })
            ).to.deep.equal({
                check: false,
                dryRun: true,
                constructorArguments: {},
                dagger: {
                    name: '<dagger-name>',
                    directory: '<directory>',
                },
                runtimes: {},
                targets: {},
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
                    constructorArguments: {},
                    dagger: {
                        name: '<dagger-name>',
                        directory: '<directory>',
                    },
                    runtimes: {},
                    targets: {},
                } satisfies DaggerOptions)
            );

            expect(await ctx.normalizer.normalizeOptions({})).to.deep.equal({
                check: false,
                dryRun: false,
                constructorArguments: {},
                dagger: {
                    name: '<dagger-name>',
                    directory: '<directory>',
                },
                runtimes: {},
                targets: {},
            });

            expect(ctx.stubbedIsCi.callCount).to.equal(1);
            expect(ctx.stubbedParseCwd.callCount).to.equal(1);
            expect(ctx.stubbedReadFile.callCount).to.equal(1);
            expect(ctx.stubbedReadFile.getCall(0).args).to.deep.equal([
                '<parsed-cwd>/nx-dagger.json',
                'utf8',
            ]);
        });

        stubs.test('Loaded config does not match schema', async ctx => {
            ctx.stubbedParseCwd.resolves('<parsed-cwd>');
            ctx.stubbedReadFile.resolves(JSON.stringify({}));

            await expect(ctx.normalizer.normalizeOptions({})).to.eventually.be.rejectedWith(
                Error,
                `Invalid config loaded from <parsed-cwd>/nx-dagger.json`
            );
        });
    });
});

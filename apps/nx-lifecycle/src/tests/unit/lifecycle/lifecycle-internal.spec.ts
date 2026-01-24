import type { readFile, writeFile } from 'node:fs/promises';
import type { FilesFormatter } from 'format-file';
import type { isNxJson, isProjectJson } from '#schemas';
import type { NormalizedOptions } from '../../../lifecycle/normalizer.js';
import type { NxAndProjectJsonProcessor } from '../../../lifecycle/processor.js';
import type { LifecycleOptions } from '../../../lifecycle/schema.js';
import type { NxContext } from '../../../lifecycle/types.js';
import { createStubInstance, define, fake, match, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { mockMethod, stubMethod } from 'sinon-typed-stub';
import { LifecycleInternal } from '../../../lifecycle/lifecycle-internal.js';
import { Normalizer } from '../../../lifecycle/normalizer.js';
import { expect } from '../../chai-hooks.js';

suite('lifecycle', () => {
    const mockOptions = {} as LifecycleOptions;
    const mockContext = {} as NxContext;

    const fakeStages: NormalizedOptions['stages'] = {};
    const fakeBindings: NormalizedOptions['bindings'] = {};

    const stubs = beforeEach(() => {
        const stubbedNormalizer = createStubInstance(Normalizer);

        const stubbedReadFile = stubMethod<typeof readFile>();
        const stubbedWriteFile = stubMethod<typeof writeFile>();
        const stubbedFormatFiles = stubMethod<FilesFormatter>();
        const mockedProcessor = mockMethod<NxAndProjectJsonProcessor>();
        const stubbedIsNxJson = stubMethod<typeof isNxJson>();
        const stubbedIsProjectJson = stubMethod<typeof isProjectJson>();

        return {
            stubbedNormalizer,
            stubbedReadFile: stubbedReadFile.stub,
            stubbedWriteFile: stubbedWriteFile.stub,
            stubbedFormatFiles: stubbedFormatFiles.stub,
            mockedProcessor: mockedProcessor.mock,
            stubbedIsNxJson: stubbedIsNxJson.stub,
            stubbedIsProjectJson: stubbedIsProjectJson.stub,
            lifecycle: new LifecycleInternal(
                stubbedNormalizer,
                stubbedReadFile.method,
                stubbedWriteFile.method,
                stubbedFormatFiles.method,
                mockedProcessor.method,
                stubbedIsNxJson.method,
                stubbedIsProjectJson.method,
                {
                    info: fake(),
                    error: fake(),
                }
            ),
        };
    });

    afterEach(() => {
        verifyAndRestore();
    });

    const fakeNxJson = { nxJson: true };
    const fakeFooProjectJson = { foo: true };
    const fakeBarProjectJson = { bar: true };

    suite('Processing files results in changes', () => {
        const fakeProcessedNxJson = { processedNxJson: true };
        const fakeProcessedFooProjectJson = { processedFoo: true };
        const fakeProcessedBarProjectJson = { processedBar: true };

        stubs.beforeEach(ctx => {
            ctx.stubbedReadFile
                .withArgs('<nx-json-path>', 'utf8')
                .resolves(JSON.stringify(fakeNxJson));
            ctx.stubbedReadFile
                .withArgs('<foo-path>', 'utf8')
                .resolves(JSON.stringify(fakeFooProjectJson));
            ctx.stubbedReadFile
                .withArgs('<bar-path>', 'utf8')
                .resolves(JSON.stringify(fakeBarProjectJson));

            ctx.stubbedIsNxJson.withArgs(match(fakeNxJson)).returns(true);
            ctx.stubbedIsProjectJson.withArgs(match(fakeFooProjectJson)).returns(true);
            ctx.stubbedIsProjectJson.withArgs(match(fakeBarProjectJson)).returns(true);
        });

        stubs.test('Writes updated files', async ctx => {
            const options = {
                check: false,
                dryRun: false,
                nxJsonPath: '<nx-json-path>',
                packageJsonPaths: [
                    { name: '<foo>', path: '<foo-path>' },
                    { name: '<bar>', path: '<bar-path>' },
                ],
                stages: fakeStages,
                bindings: fakeBindings,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .resolves(options);

            ctx.mockedProcessor
                .withArgs(
                    match({
                        nxJson: fakeNxJson,
                        projectJsons: [fakeFooProjectJson, fakeBarProjectJson],
                        options,
                    })
                )
                .returns({
                    processedNxJson: fakeProcessedNxJson,
                    processedProjectJsons: [
                        fakeProcessedFooProjectJson,
                        fakeProcessedBarProjectJson,
                    ],
                });

            ctx.stubbedWriteFile.resolves();
            ctx.stubbedFormatFiles.resolves();

            await ctx.lifecycle.lifecycleInternal(mockOptions, mockContext);

            expect(ctx.stubbedWriteFile.callCount).to.equal(3);
            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<nx-json-path>',
                    JSON.stringify(fakeProcessedNxJson),
                    'utf8'
                )
            ).to.equal(true);
            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<foo-path>',
                    JSON.stringify(fakeProcessedFooProjectJson),
                    'utf8'
                )
            ).to.equal(true);
            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<bar-path>',
                    JSON.stringify(fakeProcessedBarProjectJson),
                    'utf8'
                )
            ).to.equal(true);

            expect(ctx.stubbedFormatFiles.callCount).to.equal(1);
            expect(
                ctx.stubbedFormatFiles.calledWith(['<nx-json-path>', '<foo-path>', '<bar-path>'])
            ).to.equal(true);
        });

        stubs.test('Dry run skips writing files', async ctx => {
            const options = {
                check: false,
                dryRun: true,
                nxJsonPath: '<nx-json-path>',
                packageJsonPaths: [
                    { name: '<foo>', path: '<foo-path>' },
                    { name: '<bar>', path: '<bar-path>' },
                ],
                stages: fakeStages,
                bindings: fakeBindings,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .resolves(options);

            ctx.mockedProcessor
                .withArgs(
                    match({
                        nxJson: fakeNxJson,
                        projectJsons: [fakeFooProjectJson, fakeBarProjectJson],
                        options,
                    })
                )
                .returns({
                    processedNxJson: fakeProcessedNxJson,
                    processedProjectJsons: [
                        fakeProcessedFooProjectJson,
                        fakeProcessedBarProjectJson,
                    ],
                });

            await ctx.lifecycle.lifecycleInternal(mockOptions, mockContext);

            expect(ctx.stubbedWriteFile.notCalled).to.equal(true);
        });

        stubs.test('Check reports a failure', async ctx => {
            const options = {
                check: true,
                dryRun: false,
                nxJsonPath: '<nx-json-path>',
                packageJsonPaths: [
                    { name: '<foo>', path: '<foo-path>' },
                    { name: '<bar>', path: '<bar-path>' },
                ],
                stages: fakeStages,
                bindings: fakeBindings,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .resolves(options);

            ctx.mockedProcessor
                .withArgs(
                    match({
                        nxJson: fakeNxJson,
                        projectJsons: [fakeFooProjectJson, fakeBarProjectJson],
                        options,
                    })
                )
                .returns({
                    processedNxJson: fakeProcessedNxJson,
                    processedProjectJsons: [
                        fakeProcessedFooProjectJson,
                        fakeProcessedBarProjectJson,
                    ],
                });

            await expect(ctx.lifecycle.lifecycleInternal(mockOptions, mockContext))
                .eventually.be.rejectedWith(Error)
                .that.contain({
                    message: 'File <nx-json-path> is not up to date',
                });

            expect(ctx.stubbedWriteFile.notCalled).to.equal(true);
        });

        stubs.test('Skips files with no updates', async ctx => {
            const options = {
                check: false,
                dryRun: false,
                nxJsonPath: '<nx-json-path>',
                packageJsonPaths: [
                    { name: '<foo>', path: '<foo-path>' },
                    { name: '<bar>', path: '<bar-path>' },
                ],
                stages: fakeStages,
                bindings: fakeBindings,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .resolves(options);

            ctx.mockedProcessor
                .withArgs(
                    match({
                        nxJson: fakeNxJson,
                        projectJsons: [fakeFooProjectJson, fakeBarProjectJson],
                        options,
                    })
                )
                .returns({
                    processedNxJson: fakeNxJson,
                    processedProjectJsons: [fakeProcessedFooProjectJson, fakeBarProjectJson],
                });

            ctx.stubbedWriteFile.resolves();
            ctx.stubbedFormatFiles.resolves();

            await ctx.lifecycle.lifecycleInternal(mockOptions, mockContext);

            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<foo-path>',
                    JSON.stringify(fakeProcessedFooProjectJson),
                    'utf8'
                )
            ).to.equal(true);
            expect(ctx.stubbedWriteFile.callCount).to.equal(1);
        });
    });

    suite('Invalid loaded data throws errors', () => {
        stubs.test('Invalid nx.json', async ctx => {
            const options = {
                check: false,
                dryRun: false,
                nxJsonPath: '<nx-json-path>',
                packageJsonPaths: [
                    { name: '<foo>', path: '<foo-path>' },
                    { name: '<bar>', path: '<bar-path>' },
                ],
                stages: fakeStages,
                bindings: fakeBindings,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .resolves(options);

            ctx.stubbedReadFile
                .withArgs('<nx-json-path>', 'utf8')
                .resolves(JSON.stringify(fakeNxJson));

            ctx.stubbedIsNxJson.withArgs(match(fakeNxJson)).returns(false);
            define(ctx.stubbedIsNxJson, 'errors', ['<ERROR>']);

            await expect(ctx.lifecycle.lifecycleInternal(mockOptions, mockContext))
                .eventually.be.rejectedWith(Error)
                .that.contain({
                    message: 'Failed to parse nx.json: [\n  "<ERROR>"\n]',
                });
        });

        stubs.test('Invalid project.json', async ctx => {
            const options = {
                check: false,
                dryRun: false,
                nxJsonPath: '<nx-json-path>',
                packageJsonPaths: [
                    { name: '<foo>', path: '<foo-path>' },
                    { name: '<bar>', path: '<bar-path>' },
                ],
                stages: fakeStages,
                bindings: fakeBindings,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .resolves(options);

            ctx.stubbedReadFile
                .withArgs('<nx-json-path>', 'utf8')
                .resolves(JSON.stringify(fakeNxJson));
            ctx.stubbedReadFile
                .withArgs('<foo-path>', 'utf8')
                .resolves(JSON.stringify(fakeFooProjectJson));
            ctx.stubbedReadFile
                .withArgs('<bar-path>', 'utf8')
                .resolves(JSON.stringify(fakeBarProjectJson));

            ctx.stubbedIsNxJson.withArgs(match(fakeNxJson)).returns(true);
            ctx.stubbedIsProjectJson.withArgs(match(fakeFooProjectJson)).returns(true);

            ctx.stubbedIsProjectJson.withArgs(match(fakeBarProjectJson)).returns(false);
            define(ctx.stubbedIsProjectJson, 'errors', ['<ERROR>']);

            await expect(ctx.lifecycle.lifecycleInternal(mockOptions, mockContext))
                .eventually.be.rejectedWith(Error)
                .that.contain({
                    message: 'Failed to parse <bar-path>: [\n  "<ERROR>"\n]',
                });
        });

        stubs.afterEach(ctx => {
            ctx.mockedProcessor.never();
        });
    });
});

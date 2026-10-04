import type { readFile, writeFile } from 'node:fs/promises';
import type { FilesFormatter } from 'format-file';
import type { assertNxJson, assertProjectJson } from '#schemas';
import type { NormalizedOptions } from '#internal/lifecycle/normalizer.js';
import type { NxAndProjectJsonProcessor } from '#internal/lifecycle/processor.js';
import type { LifecycleOptions } from '#internal/lifecycle/schema.js';
import type { NxContext } from '#internal/lifecycle/types.js';
import { createStubInstance, fake, match, verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { mockMethod, stubMethod } from 'sinon-typed-stub';
import { LifecycleInternal } from '#internal/lifecycle/lifecycle-internal.js';
import { Normalizer } from '#internal/lifecycle/normalizer.js';

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
        const stubbedAssertNxJson = stubMethod<typeof assertNxJson>();
        const stubbedAssertProjectJson = stubMethod<typeof assertProjectJson>();
        const fakeLogger = {
            info: fake(),
            warn: fake(),
            error: fake(),
        };

        return {
            stubbedNormalizer,
            fakeLogger,
            stubbedReadFile: stubbedReadFile.stub,
            stubbedWriteFile: stubbedWriteFile.stub,
            stubbedFormatFiles: stubbedFormatFiles.stub,
            mockedProcessor: mockedProcessor.mock,
            stubbedAssertNxJson: stubbedAssertNxJson.stub,
            stubbedAssertProjectJson: stubbedAssertProjectJson.stub,
            lifecycle: new LifecycleInternal(
                stubbedNormalizer,
                stubbedReadFile.method,
                stubbedWriteFile.method,
                stubbedFormatFiles.method,
                mockedProcessor.method,
                stubbedAssertNxJson.method,
                stubbedAssertProjectJson.method,
                fakeLogger
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

            ctx.stubbedAssertNxJson.withArgs(match(fakeNxJson)).returns();
            ctx.stubbedAssertProjectJson.withArgs(match(fakeFooProjectJson)).returns();
            ctx.stubbedAssertProjectJson.withArgs(match(fakeBarProjectJson)).returns();
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

            const thrown: unknown = await expect(
                ctx.lifecycle.lifecycleInternal(mockOptions, mockContext)
            ).to.be.rejectedWith(Error);
            expect(thrown).to.include({
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

    stubs.test('Warns about bindings no project declares', async ctx => {
        const declaringProjectJson = { targets: { declared: {} } };
        const options = {
            check: false,
            dryRun: false,
            nxJsonPath: '<nx-json-path>',
            packageJsonPaths: [
                { name: '<foo>', path: '<foo-path>' },
                { name: '<bar>', path: '<bar-path>' },
            ],
            stages: fakeStages,
            bindings: {
                declared: 'myStage',
                typo: 'myStage',
            },
        };

        ctx.stubbedNormalizer.normalizeOptions.withArgs(mockOptions, mockContext).resolves(options);

        ctx.stubbedReadFile.withArgs('<nx-json-path>', 'utf8').resolves(JSON.stringify(fakeNxJson));
        ctx.stubbedReadFile
            .withArgs('<foo-path>', 'utf8')
            .resolves(JSON.stringify(declaringProjectJson));
        ctx.stubbedReadFile
            .withArgs('<bar-path>', 'utf8')
            .resolves(JSON.stringify(fakeBarProjectJson));

        ctx.stubbedAssertNxJson.withArgs(match(fakeNxJson)).returns();
        ctx.stubbedAssertProjectJson.withArgs(match(declaringProjectJson)).returns();
        ctx.stubbedAssertProjectJson.withArgs(match(fakeBarProjectJson)).returns();

        ctx.mockedProcessor.returns({
            processedNxJson: fakeNxJson,
            processedProjectJsons: [declaringProjectJson, fakeBarProjectJson],
        });
        ctx.stubbedFormatFiles.resolves();

        await ctx.lifecycle.lifecycleInternal(mockOptions, mockContext);

        expect(ctx.fakeLogger.warn.callCount).to.equal(1);
        expect(
            ctx.fakeLogger.warn.calledWith(
                'Bound target typo is not declared in any project.json. Is it a typo?'
            )
        ).to.equal(true);
        expect(ctx.stubbedWriteFile.notCalled).to.equal(true);
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

            ctx.stubbedAssertNxJson.withArgs(match(fakeNxJson)).throws();

            const thrown: unknown = await expect(
                ctx.lifecycle.lifecycleInternal(mockOptions, mockContext)
            ).to.be.rejectedWith(Error);
            expect(thrown).to.include({
                message: 'Failed to parse nx.json',
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

            ctx.stubbedAssertNxJson.withArgs(match(fakeNxJson)).returns();
            ctx.stubbedAssertProjectJson.withArgs(match(fakeFooProjectJson)).returns();

            ctx.stubbedAssertProjectJson.withArgs(match(fakeBarProjectJson)).throws();

            const thrown: unknown = await expect(
                ctx.lifecycle.lifecycleInternal(mockOptions, mockContext)
            ).to.be.rejectedWith(Error);
            expect(thrown).to.include({
                message: 'Failed to parse <bar-path>',
            });
        });

        stubs.afterEach(ctx => {
            ctx.mockedProcessor.never();
        });
    });
});

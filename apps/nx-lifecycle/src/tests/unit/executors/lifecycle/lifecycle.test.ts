import { readFile, writeFile } from 'node:fs/promises';
import { expect } from 'chai';
import { beforeEach, suite } from 'mocha-hookup';
import { createStubInstance, define, fake, match } from 'sinon';
import { mockMethod, stubMethod } from 'sinon-typed-stub';
import { Lifecycle } from '../../../../executors/lifecycle/lifecycle.js';
import {
    type NormalizedOptions,
    Normalizer,
} from '../../../../executors/lifecycle/normalizer.js';
import type { NxAndProjectJsonProcessor } from '../../../../executors/lifecycle/processor.js';
import type { LifecycleOptions } from '../../../../executors/lifecycle/schema.js';
import type { SimpleExecutorContext } from '../../../../executors/lifecycle/types.js';
import type { isNxJson, isProjectJson } from '#schemas';

suite('lifecycle', () => {
    const mockOptions = {} as LifecycleOptions;
    const mockContext = {} as SimpleExecutorContext;

    const fakeStages: NormalizedOptions['stages'] = {};
    const fakeTargets: NormalizedOptions['targets'] = {};

    const stubs = beforeEach(() => {
        const stubbedNormalizer = createStubInstance(Normalizer);

        const stubbedReadFile = stubMethod<typeof readFile>();
        const stubbedWriteFile = stubMethod<typeof writeFile>();
        const mockedProcessor = mockMethod<NxAndProjectJsonProcessor>();
        const stubbedIsNxJson = stubMethod<typeof isNxJson>();
        const stubbedIsProjectJson = stubMethod<typeof isProjectJson>();

        return {
            stubbedNormalizer,
            stubbedReadFile: stubbedReadFile.stub,
            stubbedWriteFile: stubbedWriteFile.stub,
            mockedProcessor: mockedProcessor.mock,
            stubbedIsNxJson: stubbedIsNxJson.stub,
            stubbedIsProjectJson: stubbedIsProjectJson.stub,
            lifecycle: new Lifecycle(
                stubbedNormalizer,
                stubbedReadFile.method,
                stubbedWriteFile.method,
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
            ctx.stubbedIsProjectJson
                .withArgs(match(fakeFooProjectJson))
                .returns(true);
            ctx.stubbedIsProjectJson
                .withArgs(match(fakeBarProjectJson))
                .returns(true);
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
                targets: fakeTargets,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .returns(options);

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

            ctx.stubbedWriteFile
                .withArgs(
                    '<nx-json-path>',
                    JSON.stringify(fakeProcessedNxJson, null, 2),
                    'utf8'
                )
                .resolves();
            ctx.stubbedWriteFile
                .withArgs(
                    '<foo-path>',
                    JSON.stringify(fakeProcessedFooProjectJson, null, 2),
                    'utf8'
                )
                .resolves();
            ctx.stubbedWriteFile
                .withArgs(
                    '<bar-path>',
                    JSON.stringify(fakeProcessedBarProjectJson, null, 2),
                    'utf8'
                )
                .resolves();

            await ctx.lifecycle.lifecycle(mockOptions, mockContext);

            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<nx-json-path>',
                    JSON.stringify(fakeProcessedNxJson, null, 2),
                    'utf8'
                )
            ).to.equal(true);
            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<foo-path>',
                    JSON.stringify(fakeProcessedFooProjectJson, null, 2),
                    'utf8'
                )
            ).to.equal(true);
            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<bar-path>',
                    JSON.stringify(fakeProcessedBarProjectJson, null, 2),
                    'utf8'
                )
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
                targets: fakeTargets,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .returns(options);

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

            await ctx.lifecycle.lifecycle(mockOptions, mockContext);

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
                targets: fakeTargets,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .returns(options);

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

            await expect(ctx.lifecycle.lifecycle(mockOptions, mockContext))
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
                targets: fakeTargets,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .returns(options);

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
                    processedProjectJsons: [
                        fakeProcessedFooProjectJson,
                        fakeBarProjectJson,
                    ],
                });

            ctx.stubbedWriteFile
                .withArgs(
                    '<foo-path>',
                    JSON.stringify(fakeProcessedFooProjectJson, null, 2),
                    'utf8'
                )
                .resolves();

            await ctx.lifecycle.lifecycle(mockOptions, mockContext);

            expect(
                ctx.stubbedWriteFile.calledWith(
                    '<foo-path>',
                    JSON.stringify(fakeProcessedFooProjectJson, null, 2),
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
                targets: fakeTargets,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .returns(options);

            ctx.stubbedReadFile
                .withArgs('<nx-json-path>', 'utf8')
                .resolves(JSON.stringify(fakeNxJson));

            ctx.stubbedIsNxJson.withArgs(match(fakeNxJson)).returns(false);
            define(ctx.stubbedIsNxJson, 'errors', ['<ERROR>']);

            await expect(ctx.lifecycle.lifecycle(mockOptions, mockContext))
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
                targets: fakeTargets,
            };

            ctx.stubbedNormalizer.normalizeOptions
                .withArgs(mockOptions, mockContext)
                .returns(options);

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
            ctx.stubbedIsProjectJson
                .withArgs(match(fakeFooProjectJson))
                .returns(true);

            ctx.stubbedIsProjectJson
                .withArgs(match(fakeBarProjectJson))
                .returns(false);
            define(ctx.stubbedIsProjectJson, 'errors', ['<ERROR>']);

            await expect(ctx.lifecycle.lifecycle(mockOptions, mockContext))
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

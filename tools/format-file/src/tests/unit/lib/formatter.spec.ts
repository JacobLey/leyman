import type fs from 'node:fs/promises';
import { expect } from 'chai';
import { fake, verifyAndRestore } from 'sinon';
import type { file } from 'tmp-promise';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { type Executor, Formatter } from '#lib';

suite('Formatter', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubbedFormatter = beforeEach(() => {
        const stubbedExec = stubMethod<Executor>();
        const stubbedReadFile = stubMethod<typeof fs.readFile>();
        const stubbedWriteFile = stubMethod<typeof fs.writeFile>();
        const stubbedTmpFileFactory = stubMethod<typeof file>();
        return {
            stubbedExec: stubbedExec.stub,
            stubbedReadFile: stubbedReadFile.stub,
            stubbedWriteFile: stubbedWriteFile.stub,
            stubbedTmpFileFactory: stubbedTmpFileFactory.stub,
            formatter: new Formatter(
                stubbedExec.method,
                () => '<biome-path>',
                stubbedReadFile.method,
                stubbedWriteFile.method,
                stubbedTmpFileFactory.method
            ),
        };
    });

    suite('formatFiles', () => {
        suite('Ignores empty input', () => {
            withStubbedFormatter.test('Missing input', async ({ stubbedExec, formatter }) => {
                await formatter.formatFiles();

                expect(stubbedExec.notCalled).to.equal(true);
            });

            withStubbedFormatter.test('Empty input', async ({ stubbedExec, formatter }) => {
                await formatter.formatFiles([]);

                expect(stubbedExec.notCalled).to.equal(true);
            });
        });

        withStubbedFormatter.test('Properly bound', async ({ formatter, stubbedExec }) => {
            stubbedExec.resolves();

            await formatter.formatFiles.call(null, ['<filename>']);

            expect(
                stubbedExec.calledWith('<biome-path>', ['format', '--write', '<filename>'])
            ).to.equal(true);
        });
    });

    suite('formatFile', () => {
        withStubbedFormatter.test('Properly bound', async ({ formatter, stubbedExec }) => {
            stubbedExec.resolves();

            await formatter.formatFile.call(null, '<filename>');

            expect(
                stubbedExec.calledWith('<biome-path>', ['format', '--write', '<filename>'])
            ).to.equal(true);
        });
    });

    suite('formatText', () => {
        withStubbedFormatter.test(
            'Properly bound',
            async ({
                formatter,
                stubbedExec,
                stubbedReadFile,
                stubbedWriteFile,
                stubbedTmpFileFactory,
            }) => {
                const fakeCleanup = fake.resolves(null);
                stubbedTmpFileFactory.resolves({
                    path: '<path>',
                    fd: 123,
                    cleanup: fakeCleanup,
                });
                stubbedWriteFile.resolves();
                stubbedExec.resolves();
                stubbedReadFile.resolves('<formatted>');

                expect(await formatter.formatText.call(null, '<content>')).to.equal('<formatted>');

                expect(
                    stubbedTmpFileFactory.calledWith({
                        prefix: 'format-file',
                        postfix: '.js',
                    })
                ).to.equal(true);
                expect(stubbedWriteFile.calledWith('<path>', '<content>', 'utf8')).to.equal(true);
                expect(
                    stubbedExec.calledWith('<biome-path>', ['format', '--write', '<path>'])
                ).to.equal(true);
                expect(fakeCleanup.calledAfter(stubbedReadFile)).to.equal(true);
            }
        );
    });
});

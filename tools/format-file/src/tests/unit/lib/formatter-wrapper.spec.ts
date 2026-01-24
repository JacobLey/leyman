import type fs from 'node:fs/promises';
import type { file } from 'tmp-promise';
import type { FilesFormatter } from '#types';
import { expect } from 'chai';
import { fake, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { FormatterWrapper } from '#lib';

suite('Formatter', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedFilesFormatter = stubMethod<FilesFormatter>();
        const stubbedReadFile = stubMethod<typeof fs.readFile>();
        const stubbedWriteFile = stubMethod<typeof fs.writeFile>();
        const stubbedTmpFileFactory = stubMethod<typeof file>();
        return {
            stubbedFilesFormatter: stubbedFilesFormatter.stub,
            stubbedReadFile: stubbedReadFile.stub,
            stubbedWriteFile: stubbedWriteFile.stub,
            stubbedTmpFileFactory: stubbedTmpFileFactory.stub,
            formatterWrapper: new FormatterWrapper(
                stubbedFilesFormatter.method,
                stubbedReadFile.method,
                stubbedWriteFile.method,
                stubbedTmpFileFactory.method
            ),
        };
    });

    suite('formatFile', () => {
        withStubs.test('Turns filename into a list', async ctx => {
            ctx.stubbedFilesFormatter.resolves();

            await ctx.formatterWrapper.formatFile('<filename>');

            expect(ctx.stubbedFilesFormatter.calledWith(['<filename>'])).to.equal(true);
        });

        withStubs.test('Propagates options', async ctx => {
            ctx.stubbedFilesFormatter.resolves();

            await ctx.formatterWrapper.formatFile('<filename>', {
                formatter: 'inherit',
            });

            expect(
                ctx.stubbedFilesFormatter.calledWith(['<filename>'], {
                    formatter: 'inherit',
                })
            ).to.equal(true);
        });
    });

    suite('formatText', () => {
        withStubs.test('Writes to temp file and formats', async ctx => {
            const fakeCleanup = fake.resolves(null);
            ctx.stubbedTmpFileFactory.resolves({
                path: '<path>',
                fd: 123,
                cleanup: fakeCleanup,
            });
            ctx.stubbedWriteFile.resolves();
            ctx.stubbedFilesFormatter.resolves();
            ctx.stubbedReadFile.resolves('<formatted>');

            expect(await ctx.formatterWrapper.formatText('<content>')).to.equal('<formatted>');

            expect(
                ctx.stubbedTmpFileFactory.calledWith({
                    prefix: 'format-file',
                    postfix: '.js',
                })
            ).to.equal(true);
            expect(ctx.stubbedWriteFile.calledWith('<path>', '<content>', 'utf8')).to.equal(true);
            expect(
                ctx.stubbedFilesFormatter.calledWith(['<path>'], { formatter: undefined })
            ).to.equal(true);
            expect(fakeCleanup.calledAfter(ctx.stubbedReadFile)).to.equal(true);
        });

        withStubs.test('Override file extension', async ctx => {
            const fakeCleanup = fake.resolves(null);
            ctx.stubbedTmpFileFactory.resolves({
                path: '<path>',
                fd: 123,
                cleanup: fakeCleanup,
            });
            ctx.stubbedWriteFile.resolves();
            ctx.stubbedFilesFormatter.resolves();
            ctx.stubbedReadFile.resolves('<formatted>');

            expect(
                await ctx.formatterWrapper.formatText('<content>', {
                    ext: '.json',
                    formatter: 'biome',
                })
            ).to.equal('<formatted>');

            expect(
                ctx.stubbedTmpFileFactory.calledWith({
                    prefix: 'format-file',
                    postfix: '.json',
                })
            ).to.equal(true);
            expect(ctx.stubbedWriteFile.calledWith('<path>', '<content>', 'utf8')).to.equal(true);
            expect(
                ctx.stubbedFilesFormatter.calledWith(['<path>'], { formatter: 'biome' })
            ).to.equal(true);
            expect(fakeCleanup.calledAfter(ctx.stubbedReadFile)).to.equal(true);
        });
    });
});

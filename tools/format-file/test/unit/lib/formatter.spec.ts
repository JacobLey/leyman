import type { CanUseFormatter } from '#types';
import { verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Formatter } from '#lib';

suite('Formatter', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedCanUseBiome = stubMethod<() => Promise<CanUseFormatter>>();
        const stubbedFormatBiomeFiles = stubMethod<(files: string[]) => Promise<void>>();
        const stubbedCanUsePrettier = stubMethod<() => Promise<CanUseFormatter>>();
        const stubbedFormatPrettierFiles = stubMethod<(files: string[]) => Promise<void>>();
        return {
            stubbedCanUseBiome: stubbedCanUseBiome.stub,
            stubbedFormatBiomeFiles: stubbedFormatBiomeFiles.stub,
            stubbedCanUsePrettier: stubbedCanUsePrettier.stub,
            stubbedFormatPrettierFiles: stubbedFormatPrettierFiles.stub,
            formatter: new Formatter(
                {
                    canUseBiome: stubbedCanUseBiome.method,
                    formatBiomeFiles: stubbedFormatBiomeFiles.method,
                },
                {
                    canUsePrettier: stubbedCanUsePrettier.method,
                    formatPrettierFiles: stubbedFormatPrettierFiles.method,
                }
            ),
        };
    });

    suite('formatFiles', () => {
        withStubs.test('Empty input', async ctx => {
            await ctx.formatter.formatFiles([]);

            expect(ctx.stubbedCanUseBiome.notCalled).to.equal(true);
            expect(ctx.stubbedFormatBiomeFiles.notCalled).to.equal(true);
            expect(ctx.stubbedCanUsePrettier.notCalled).to.equal(true);
            expect(ctx.stubbedFormatPrettierFiles.notCalled).to.equal(true);
        });

        withStubs.test('Uses first valid formatter', async ctx => {
            ctx.stubbedCanUseBiome.resolves(2);
            ctx.stubbedCanUsePrettier.resolves(2);
            ctx.stubbedFormatBiomeFiles.resolves();

            await ctx.formatter.formatFiles(['<filename>'], { formatter: 'inherit' });

            expect(ctx.stubbedFormatBiomeFiles.calledWith(['<filename>'])).to.equal(true);

            expect(ctx.stubbedFormatPrettierFiles.notCalled).to.equal(true);
        });

        withStubs.test('Prefers configured formatter', async ctx => {
            ctx.stubbedCanUseBiome.resolves(1);
            ctx.stubbedCanUsePrettier.resolves(2);
            ctx.stubbedFormatPrettierFiles.rejects();
            ctx.stubbedFormatBiomeFiles.resolves();

            await ctx.formatter.formatFiles.call(null, ['<filename>']);

            expect(ctx.stubbedFormatPrettierFiles.calledWith(['<filename>'])).to.equal(true);
            expect(ctx.stubbedFormatBiomeFiles.calledWith(['<filename>'])).to.equal(true);
            expect(
                ctx.stubbedFormatPrettierFiles.calledBefore(ctx.stubbedFormatBiomeFiles)
            ).to.equal(true);
        });

        withStubs.test('Omits missing formatters', async ctx => {
            ctx.stubbedCanUseBiome.resolves(0);
            ctx.stubbedCanUsePrettier.resolves(1);
            ctx.stubbedFormatBiomeFiles.resolves();

            await ctx.formatter.formatFiles.call(null, ['<filename>']);

            expect(ctx.stubbedFormatPrettierFiles.calledWith(['<filename>'])).to.equal(true);

            expect(ctx.stubbedFormatBiomeFiles.notCalled).to.equal(true);
        });

        withStubs.test('Specify formatter', async ctx => {
            ctx.stubbedCanUseBiome.resolves(2);
            ctx.stubbedCanUsePrettier.resolves(1);
            ctx.stubbedFormatPrettierFiles.resolves();

            await ctx.formatter.formatFiles(['<filename>'], { formatter: 'prettier' });

            expect(ctx.stubbedFormatPrettierFiles.calledWith(['<filename>'])).to.equal(true);
            expect(ctx.stubbedFormatBiomeFiles.notCalled).to.equal(true);
        });

        withStubs.test('Resolves even if all formatters fail', async ctx => {
            ctx.stubbedCanUseBiome.resolves(1);
            ctx.stubbedCanUsePrettier.resolves(1);
            ctx.stubbedFormatBiomeFiles.rejects();
            ctx.stubbedFormatPrettierFiles.rejects();

            await ctx.formatter.formatFiles(['<filename>']);

            expect(ctx.stubbedFormatBiomeFiles.calledWith(['<filename>'])).to.equal(true);
            expect(ctx.stubbedFormatPrettierFiles.calledWith(['<filename>'])).to.equal(true);
        });

        withStubs.test('Checks formatter availability once', async ctx => {
            ctx.stubbedCanUseBiome.resolves(2);
            ctx.stubbedCanUsePrettier.resolves(1);
            ctx.stubbedFormatBiomeFiles.resolves();

            await ctx.formatter.formatFiles(['<filename-1>']);
            await ctx.formatter.formatFiles(['<filename-2>']);

            expect(ctx.stubbedCanUseBiome.calledOnce).to.equal(true);
            expect(ctx.stubbedCanUsePrettier.calledOnce).to.equal(true);
        });

        withStubs.test('Resolves even if no formatters supported', async ctx => {
            ctx.stubbedCanUseBiome.resolves(0);
            ctx.stubbedCanUsePrettier.resolves(0);

            await ctx.formatter.formatFiles(['<filename>']);

            expect(ctx.stubbedFormatBiomeFiles.notCalled).to.equal(true);
            expect(ctx.stubbedFormatPrettierFiles.notCalled).to.equal(true);
        });
    });
});

import type { TextFormatter } from 'format-file';
import type { ParseCwd } from 'parse-cwd';
import { beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Normalize } from '../../../lib/normalize.js';
import { expect } from '../../chai-hooks.js';

suite('Normalize', () => {
    const withStubs = beforeEach(() => {
        const stubbedTextFormatter = stubMethod<TextFormatter>();
        const stubbedParseCwd = stubMethod<ParseCwd>();
        return {
            stubbedTextFormatter: stubbedTextFormatter.stub,
            stubbedParseCwd: stubbedParseCwd.stub,
            normalize: new Normalize(true, stubbedParseCwd.method, stubbedTextFormatter.method),
        };
    });

    suite('normalizeFileParams', () => {
        withStubs.test('success', async ctx => {
            ctx.stubbedParseCwd.withArgs('<cwd>').resolves('/root/dir');

            expect(
                await ctx.normalize.normalizeFileParams(
                    {
                        filePath: 'file/path',
                        content: '<content>',
                    },
                    {
                        dryRun: true,
                        check: false,
                        cwd: '<cwd>',
                    }
                )
            ).to.deep.equal({
                filePath: '/root/dir/file/path',
                content: new Uint8Array([60, 99, 111, 110, 116, 101, 110, 116, 62]),
                dryRun: true,
                check: false,
            });

            expect(ctx.stubbedTextFormatter.called).to.equal(false);
        });

        withStubs.test('Options are optional', async ctx => {
            ctx.stubbedParseCwd.resolves('/root/dir');
            ctx.stubbedTextFormatter
                .withArgs('{"foo":"bar"}', { ext: '.json' })
                .resolves('foo-bar');

            expect(
                await ctx.normalize.normalizeFileParams({
                    filePath: '/file/path',
                    content: Promise.resolve({ foo: 'bar' }),
                })
            ).to.deep.equal({
                filePath: '/file/path',
                content: new Uint8Array([102, 111, 111, 45, 98, 97, 114]),
                dryRun: false,
                check: true,
            });
        });
    });

    suite('normalizeFilesParams', () => {
        withStubs.test('success', async ctx => {
            ctx.stubbedParseCwd.withArgs('<cwd>').resolves('/root/dir');

            expect(
                await ctx.normalize.normalizeFilesParams(
                    [
                        {
                            filePath: 'file/path/1',
                            content: '<content>',
                        },
                        {
                            filePath: '/file/path/2',
                            content: new Uint8Array([1, 2, 3, 4]),
                        },
                    ],
                    {
                        dryRun: true,
                        check: false,
                        cwd: '<cwd>',
                    }
                )
            ).to.deep.equal({
                files: [
                    {
                        filePath: '/root/dir/file/path/1',
                        content: new Uint8Array([60, 99, 111, 110, 116, 101, 110, 116, 62]),
                    },
                    {
                        filePath: '/file/path/2',
                        content: new Uint8Array([1, 2, 3, 4]),
                    },
                ],
                dryRun: true,
                check: false,
            });

            expect(ctx.stubbedTextFormatter.called).to.equal(false);
        });

        withStubs.test('Options are optional', async ctx => {
            ctx.stubbedParseCwd.resolves('/root/dir');
            ctx.stubbedTextFormatter
                .withArgs('{"foo":"bar"}', { ext: '.json' })
                .resolves('foo-bar');

            expect(
                await ctx.normalize.normalizeFilesParams([
                    { filePath: 'file/path/1', content: { foo: 'bar' } },
                    { filePath: '/file/path/2', content: Promise.resolve('<data>') },
                ])
            ).to.deep.equal({
                files: [
                    {
                        filePath: '/root/dir/file/path/1',
                        content: new Uint8Array([102, 111, 111, 45, 98, 97, 114]),
                    },
                    {
                        filePath: '/file/path/2',
                        content: new Uint8Array([60, 100, 97, 116, 97, 62]),
                    },
                ],
                dryRun: false,
                check: true,
            });
        });
    });
});

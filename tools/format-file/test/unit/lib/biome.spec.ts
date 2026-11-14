import type { Suite } from 'mocha';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFormatters, createTmpCwd, formatted, unformatted } from '#test/unit/helpers.js';

suite('Biome', function (this: Suite) {
    // Each test runs the real formatter's process: tens of milliseconds alone, but a full CI run shares a small runner
    this.timeout(10_000);

    const withTmpCwd = beforeEach(createTmpCwd);
    withTmpCwd.afterEach(async ctx => {
        await ctx.restore();
    });

    suite('canUseBiome', () => {
        withTmpCwd.test('Not installed', async () => {
            expect(await createFormatters({ biome: false }).biome.canUseBiome()).to.equal(0);
        });

        withTmpCwd.test('Installed without config', async () => {
            expect(await createFormatters().biome.canUseBiome()).to.equal(1);
        });

        for (const config of ['biome.json', 'biome.jsonc']) {
            withTmpCwd.test(`Configured with ${config}`, async ctx => {
                await ctx.write(config, '{}');

                expect(await createFormatters().biome.canUseBiome()).to.equal(2);
            });
        }

        withTmpCwd.test('Configured in parent directory', async ctx => {
            await ctx.write('biome.json', '{}');
            await ctx.write('nested/file.js', '');
            process.chdir(ctx.resolve('nested'));

            expect(await createFormatters().biome.canUseBiome()).to.equal(2);
        });
    });

    suite('Formats files that version control ignores', () => {
        const withIgnored = withTmpCwd.beforeEach(async ctx => {
            await ctx.write(
                'biome.json',
                JSON.stringify({ vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true } })
            );
            await ctx.write('.gitignore', 'ignored/\n');
            await ctx.write('ignored/file.js', unformatted.js);
        });

        withIgnored.test('formatBiomeFiles', async ctx => {
            await createFormatters().biome.formatBiomeFiles([ctx.resolve('ignored/file.js')], {
                skipUnmatched: false,
            });

            expect(await ctx.read('ignored/file.js')).to.equal(formatted.biome);
        });

        withIgnored.test('formatBiomeText', async ctx => {
            expect(
                await createFormatters().biome.formatBiomeText(
                    unformatted.js,
                    ctx.resolve('ignored/file.js')
                )
            ).to.equal(formatted.biome);
        });
    });

    suite('formatBiomeFiles', () => {
        const withIgnored = withTmpCwd.beforeEach(async ctx => {
            await ctx.write(
                'biome.json',
                JSON.stringify({ files: { includes: ['**', '!skip.js'] } })
            );
            await ctx.write('skip.js', unformatted.js);
            await ctx.write('file.js', unformatted.js);
        });

        withIgnored.test('Rejects when every file is ignored', async ctx => {
            await expect(
                createFormatters().biome.formatBiomeFiles([ctx.resolve('skip.js')], {
                    skipUnmatched: false,
                })
            ).to.be.rejectedWith(Error);

            expect(await ctx.read('skip.js')).to.equal(unformatted.js);
        });

        withIgnored.test('Skips every ignored file with skipUnmatched', async ctx => {
            await createFormatters().biome.formatBiomeFiles([ctx.resolve('skip.js')], {
                skipUnmatched: true,
            });

            expect(await ctx.read('skip.js')).to.equal(unformatted.js);
        });

        withIgnored.test('Skips an ignored file with skipUnmatched', async ctx => {
            await createFormatters().biome.formatBiomeFiles(
                [ctx.resolve('skip.js'), ctx.resolve('file.js')],
                { skipUnmatched: true }
            );

            expect(await ctx.read('skip.js')).to.equal(unformatted.js);
            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Skips an unsupported file with skipUnmatched', async ctx => {
            await ctx.write('file.less', unformatted.less);

            await createFormatters().biome.formatBiomeFiles([ctx.resolve('file.less')], {
                skipUnmatched: true,
            });

            expect(await ctx.read('file.less')).to.equal(unformatted.less);
        });
    });
});

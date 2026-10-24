import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFormatters, createTmpCwd, formatted, unformatted } from '../helpers.js';

suite('Biome', () => {
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
            await createFormatters().biome.formatBiomeFiles([ctx.resolve('ignored/file.js')]);

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
});

import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFormatters, createTmpCwd } from '../helpers.js';

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
});

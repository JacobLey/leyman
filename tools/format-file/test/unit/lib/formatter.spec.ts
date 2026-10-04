import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFormatters, createTmpCwd, formatted, unformatted } from '../helpers.js';

suite('Formatter', () => {
    const withTmpCwd = beforeEach(createTmpCwd);
    withTmpCwd.afterEach(async ctx => {
        await ctx.restore();
    });

    suite('formatFiles', () => {
        withTmpCwd.test('Empty input', async () => {
            await createFormatters().formatter.formatFiles([]);
        });

        withTmpCwd.test('Uses biome when neither is configured', async ctx => {
            await ctx.write('file.js', unformatted.js);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Prefers configured formatter', async ctx => {
            await ctx.write('.prettierrc', '{}');
            await ctx.write('file.js', unformatted.js);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(formatted.prettier);
        });

        withTmpCwd.test('Falls back when a formatter fails', async ctx => {
            // Biome does not support markdown
            await ctx.write('file.md', unformatted.md);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.md')]);

            expect(await ctx.read('file.md')).to.equal(formatted.md);
        });

        withTmpCwd.test('Falls back when configured formatter has invalid config', async ctx => {
            await ctx.write('.prettierrc', '{ invalid');
            await ctx.write('file.js', unformatted.js);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Skips formatters that are not installed', async ctx => {
            await ctx.write('biome.json', '{}');
            await ctx.write('file.js', unformatted.js);

            await createFormatters({ biome: false }).formatter.formatFiles([
                ctx.resolve('file.js'),
            ]);

            expect(await ctx.read('file.js')).to.equal(formatted.prettier);
        });

        withTmpCwd.test('Specify formatter', async ctx => {
            await ctx.write('biome.json', '{}');
            await ctx.write('file.js', unformatted.js);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.js')], {
                formatter: 'prettier',
            });

            expect(await ctx.read('file.js')).to.equal(formatted.prettier);
        });

        withTmpCwd.test('Specified formatter does not fall back', async ctx => {
            await ctx.write('file.md', unformatted.md);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.md')], {
                formatter: 'biome',
            });

            expect(await ctx.read('file.md')).to.equal(unformatted.md);
        });

        withTmpCwd.test('Resolves even if all formatters fail', async ctx => {
            await ctx.write('file.js', unformatted.invalid);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(unformatted.invalid);
        });

        withTmpCwd.test('Resolves even if no formatters installed', async ctx => {
            await ctx.write('file.js', unformatted.js);

            await createFormatters({ biome: false, prettier: false }).formatter.formatFiles([
                ctx.resolve('file.js'),
            ]);

            expect(await ctx.read('file.js')).to.equal(unformatted.js);
        });

        withTmpCwd.test('Checks formatter availability once', async ctx => {
            await ctx.write('first.js', unformatted.js);
            await ctx.write('second.js', unformatted.js);
            const { formatter } = createFormatters();

            await formatter.formatFiles([ctx.resolve('first.js')]);
            // Would be preferred if availability was re-checked
            await ctx.write('.prettierrc', '{}');
            await formatter.formatFiles([ctx.resolve('second.js')]);

            expect(await ctx.read('second.js')).to.equal(formatted.biome);
        });
    });
});

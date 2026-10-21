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

    suite('formatText', () => {
        withTmpCwd.test('Uses the project configuration', async ctx => {
            await ctx.write('.prettierrc', '{ "tabWidth": 8, "singleQuote": true }');

            expect(
                await createFormatters().formatter.formatText('function f(){return "x"}', {
                    formatter: 'prettier',
                })
            ).to.equal("function f() {\n        return 'x';\n}\n");

            await ctx.write(
                'biome.json',
                '{ "formatter": { "indentStyle": "space", "indentWidth": 3 } }'
            );
            expect(
                await createFormatters().formatter.formatText(unformatted.js, {
                    formatter: 'biome',
                })
            ).to.equal('function f() {\n   return 1;\n}\n');
        });

        withTmpCwd.test('Formats by extension', async () => {
            expect(
                await createFormatters().formatter.formatText('{"a":1}', { ext: '.json' })
            ).to.equal('{ "a": 1 }\n');
        });

        withTmpCwd.test('Falls back when a formatter fails', async ctx => {
            // Preferred, but fails on its invalid config
            await ctx.write('.prettierrc', '{ invalid');

            expect(await createFormatters().formatter.formatText(unformatted.js)).to.equal(
                formatted.biome
            );
        });

        withTmpCwd.test('A null formatter uses every formatter', async () => {
            expect(
                await createFormatters().formatter.formatText(unformatted.js, { formatter: null })
            ).to.equal(formatted.biome);
        });

        withTmpCwd.test('Returns the text when every formatter fails', async () => {
            expect(await createFormatters().formatter.formatText(unformatted.invalid)).to.equal(
                unformatted.invalid
            );
        });
    });
});

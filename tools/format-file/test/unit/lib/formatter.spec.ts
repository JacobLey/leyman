import type { Suite } from 'mocha';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { FormatFileError } from '#lib';
import { createFormatters, createTmpCwd, formatted, unformatted } from '#test/unit/helpers.js';

suite('Formatter', function (this: Suite) {
    // Each test runs the real formatter's process: tens of milliseconds alone, but a full CI run shares a small runner
    this.timeout(10_000);

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

        withTmpCwd.test('Accepts a readonly array', async ctx => {
            await ctx.write('file.js', unformatted.js);
            const files = [ctx.resolve('file.js')] as const;

            await createFormatters().formatter.formatFiles(files);

            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Prefers configured formatter', async ctx => {
            await ctx.write('.prettierrc', '{}');
            await ctx.write('file.js', unformatted.js);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(formatted.prettier);
        });

        withTmpCwd.test('Leaves a file the formatter does not support unchanged', async ctx => {
            // Biome does not support Less
            await ctx.write('file.less', unformatted.less);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.less')]);

            expect(await ctx.read('file.less')).to.equal(unformatted.less);
        });

        withTmpCwd.test('Leaves a file the formatter ignores unchanged', async ctx => {
            await ctx.write(
                'biome.json',
                JSON.stringify({ files: { includes: ['**', '!skip.js'] } })
            );
            await ctx.write('skip.js', unformatted.js);

            // Not passed on to Prettier
            await createFormatters().formatter.formatFiles([ctx.resolve('skip.js')]);

            expect(await ctx.read('skip.js')).to.equal(unformatted.js);
        });

        withTmpCwd.test('Leaves a missing file alone', async ctx => {
            await ctx.write('file.js', unformatted.js);

            await createFormatters().formatter.formatFiles([
                ctx.resolve('missing.js'),
                ctx.resolve('file.js'),
            ]);

            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Rejects when the formatter fails on a file', async ctx => {
            await ctx.write('file.js', unformatted.js);
            await ctx.write('invalid.js', unformatted.invalid);

            const thrown: unknown = await expect(
                createFormatters().formatter.formatFiles([
                    ctx.resolve('file.js'),
                    ctx.resolve('invalid.js'),
                ])
            ).to.be.rejectedWith(FormatFileError);

            expect(thrown).to.have.property('formatter', 'biome');
            expect(thrown).to.have.property('cause').that.is.an.instanceOf(Error);
            // Written by Biome before it failed, and not reformatted by Prettier
            expect(await ctx.read('file.js')).to.equal(formatted.biome);
            expect(await ctx.read('invalid.js')).to.equal(unformatted.invalid);
        });

        withTmpCwd.test('Rejects when the formatter has an invalid config', async ctx => {
            await ctx.write('.prettierrc', '{ invalid');
            await ctx.write('file.js', unformatted.js);

            const thrown: unknown = await expect(
                createFormatters().formatter.formatFiles([ctx.resolve('file.js')])
            ).to.be.rejectedWith(FormatFileError);

            expect(thrown).to.have.property('formatter', 'prettier');
            expect(await ctx.read('file.js')).to.equal(unformatted.js);
        });

        suite('unsafeFallback', () => {
            withTmpCwd.test('Falls back when a formatter fails', async ctx => {
                // Biome does not support Less
                await ctx.write('file.less', unformatted.less);

                await createFormatters().formatter.formatFiles([ctx.resolve('file.less')], {
                    unsafeFallback: true,
                });

                expect(await ctx.read('file.less')).to.equal(formatted.less);
            });

            withTmpCwd.test(
                'Falls back when configured formatter has invalid config',
                async ctx => {
                    await ctx.write('.prettierrc', '{ invalid');
                    await ctx.write('file.js', unformatted.js);

                    await createFormatters().formatter.formatFiles([ctx.resolve('file.js')], {
                        unsafeFallback: true,
                    });

                    expect(await ctx.read('file.js')).to.equal(formatted.biome);
                }
            );

            withTmpCwd.test('Next formatter reformats every file', async ctx => {
                await ctx.write('file.js', unformatted.js);
                await ctx.write('invalid.js', unformatted.invalid);

                await createFormatters().formatter.formatFiles(
                    [ctx.resolve('file.js'), ctx.resolve('invalid.js')],
                    { unsafeFallback: true }
                );

                expect(await ctx.read('file.js')).to.equal(formatted.prettier);
            });

            withTmpCwd.test('Resolves even if all formatters fail', async ctx => {
                await ctx.write('file.js', unformatted.invalid);

                await createFormatters().formatter.formatFiles([ctx.resolve('file.js')], {
                    unsafeFallback: true,
                });

                expect(await ctx.read('file.js')).to.equal(unformatted.invalid);
            });
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
            await ctx.write('file.less', unformatted.less);

            await createFormatters().formatter.formatFiles([ctx.resolve('file.less')], {
                formatter: 'biome',
            });

            expect(await ctx.read('file.less')).to.equal(unformatted.less);
        });

        suite('Markdown', () => {
            for (const name of ['file.md', 'file.MD', 'file.markdown']) {
                withTmpCwd.test(
                    `Prettier formats ${name}, even if Biome is configured`,
                    async ctx => {
                        await ctx.write('biome.json', '{}');
                        await ctx.write(name, unformatted.md);

                        await createFormatters().formatter.formatFiles([ctx.resolve(name)]);

                        expect(await ctx.read(name)).to.equal(formatted.md);
                    }
                );
            }

            withTmpCwd.test('Keeps frontmatter', async ctx => {
                await ctx.write('biome.json', '{}');
                await ctx.write('file.md', unformatted.frontmatter);

                await createFormatters().formatter.formatFiles([ctx.resolve('file.md')]);

                expect(await ctx.read('file.md')).to.equal(unformatted.frontmatter);
            });

            withTmpCwd.test('Biome leaves it unchanged when specified', async ctx => {
                await ctx.write('file.md', unformatted.md);

                await createFormatters().formatter.formatFiles([ctx.resolve('file.md')], {
                    formatter: 'biome',
                });

                expect(await ctx.read('file.md')).to.equal(unformatted.md);
            });

            withTmpCwd.test('Biome still formats the files passed with it', async ctx => {
                await ctx.write('biome.json', '{}');
                await ctx.write('first.md', unformatted.md);
                await ctx.write('file.js', unformatted.js);
                await ctx.write('second.md', unformatted.md);

                await createFormatters().formatter.formatFiles([
                    ctx.resolve('first.md'),
                    ctx.resolve('file.js'),
                    ctx.resolve('second.md'),
                ]);

                expect(await ctx.read('first.md')).to.equal(formatted.md);
                expect(await ctx.read('file.js')).to.equal(formatted.biome);
                expect(await ctx.read('second.md')).to.equal(formatted.md);
            });
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

        withTmpCwd.test('Rejects when the formatter has an invalid config', async ctx => {
            await ctx.write('.prettierrc', '{ invalid');

            const thrown: unknown = await expect(
                createFormatters().formatter.formatText(unformatted.js)
            ).to.be.rejectedWith(FormatFileError);

            expect(thrown).to.have.property('formatter', 'prettier');
        });

        withTmpCwd.test('Falls back when a formatter fails with unsafeFallback', async ctx => {
            // Preferred, but fails on its invalid config
            await ctx.write('.prettierrc', '{ invalid');

            expect(
                await createFormatters().formatter.formatText(unformatted.js, {
                    unsafeFallback: true,
                })
            ).to.equal(formatted.biome);
        });

        withTmpCwd.test('A null formatter uses every formatter', async () => {
            expect(
                await createFormatters().formatter.formatText(unformatted.js, { formatter: null })
            ).to.equal(formatted.biome);
        });

        withTmpCwd.test('Rejects when the formatter fails', async () => {
            const thrown: unknown = await expect(
                createFormatters().formatter.formatText(unformatted.invalid)
            ).to.be.rejectedWith(FormatFileError);

            expect(thrown).to.have.property('formatter', 'biome');
        });

        withTmpCwd.test('Returns the text when no formatter is installed', async () => {
            expect(
                await createFormatters({ biome: false, prettier: false }).formatter.formatText(
                    unformatted.invalid
                )
            ).to.equal(unformatted.invalid);
        });

        withTmpCwd.test(
            'Returns the text when every formatter fails with unsafeFallback',
            async () => {
                expect(
                    await createFormatters().formatter.formatText(unformatted.invalid, {
                        unsafeFallback: true,
                    })
                ).to.equal(unformatted.invalid);
            }
        );
    });
});

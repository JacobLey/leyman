import { symlink } from 'node:fs/promises';
import { resolveConfigFile } from 'prettier';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFormatters, createTmpCwd, formatted, unformatted } from '#test/unit/helpers.js';

suite('Prettier', () => {
    const withTmpCwd = beforeEach(createTmpCwd);
    withTmpCwd.afterEach(async ctx => {
        await ctx.restore();
    });

    suite('canUsePrettier', () => {
        withTmpCwd.test('Not installed', async () => {
            expect(await createFormatters({ prettier: false }).prettier.canUsePrettier()).to.equal(
                0
            );
        });

        withTmpCwd.test('Installed without config', async () => {
            expect(await createFormatters().prettier.canUsePrettier()).to.equal(1);
        });

        withTmpCwd.test('Configured in current directory', async ctx => {
            await ctx.write('.prettierrc', '{}');

            expect(await createFormatters().prettier.canUsePrettier()).to.equal(2);
        });

        withTmpCwd.test('Configured in parent directory', async ctx => {
            await ctx.write('.prettierrc', '{}');
            await ctx.write('nested/file.js', '');
            process.chdir(ctx.resolve('nested'));

            expect(await createFormatters().prettier.canUsePrettier()).to.equal(2);
        });

        suite('Agrees with Prettier on what is a config', () => {
            const agrees = async (expected: 1 | 2): Promise<void> => {
                expect(await createFormatters().prettier.canUsePrettier()).to.equal(expected);
                expect((await resolveConfigFile()) !== null).to.equal(expected === 2);
            };

            for (const name of [
                '.prettierrc',
                '.prettierrc.json',
                '.prettierrc.yml',
                '.prettierrc.yaml',
                '.prettierrc.json5',
                '.prettierrc.js',
                'prettier.config.js',
                '.prettierrc.ts',
                'prettier.config.ts',
                '.prettierrc.mjs',
                'prettier.config.mjs',
                '.prettierrc.mts',
                'prettier.config.mts',
                '.prettierrc.cjs',
                'prettier.config.cjs',
                '.prettierrc.cts',
                'prettier.config.cts',
                '.prettierrc.toml',
            ]) {
                withTmpCwd.test(name, async ctx => {
                    await ctx.write(name, '');

                    await agrees(2);
                });
            }

            withTmpCwd.test('package.json with a prettier key', async ctx => {
                await ctx.write('package.json', '{"prettier": {}}');

                await agrees(2);
            });

            withTmpCwd.test('package.json with a prettier key in a parent', async ctx => {
                await ctx.write('package.json', '{"prettier": {}}');
                await ctx.write('nested/package.json', '{}');
                process.chdir(ctx.resolve('nested'));

                await agrees(2);
            });

            withTmpCwd.test('package.json without a prettier key', async ctx => {
                await ctx.write('package.json', '{}');

                await agrees(1);
            });

            withTmpCwd.test('package.json that is not JSON', async ctx => {
                await ctx.write('package.json', '{');

                await agrees(1);
            });

            withTmpCwd.test('package.yaml with a prettier key', async ctx => {
                await ctx.write('package.yaml', 'prettier: {}\n');

                await agrees(2);
            });

            withTmpCwd.test('package.yaml without a prettier key', async ctx => {
                await ctx.write('package.yaml', 'name: a\n');

                await agrees(1);
            });
        });
    });

    suite('Formats files that .gitignore lists', () => {
        const withIgnored = withTmpCwd.beforeEach(async ctx => {
            await ctx.write('.prettierrc', '{}');
            await ctx.write('.gitignore', 'ignored/\n');
            await ctx.write('ignored/file.js', unformatted.js);
        });

        withIgnored.test('formatPrettierFiles', async ctx => {
            await createFormatters().prettier.formatPrettierFiles([ctx.resolve('ignored/file.js')]);

            expect(await ctx.read('ignored/file.js')).to.equal(formatted.prettier);
        });

        withIgnored.test('formatPrettierText', async ctx => {
            expect(
                await createFormatters().prettier.formatPrettierText(
                    unformatted.js,
                    ctx.resolve('ignored/file.js')
                )
            ).to.equal(formatted.prettier);
        });

        withIgnored.test('.prettierignore still applies', async ctx => {
            await ctx.write('.prettierignore', 'ignored/\n');

            await createFormatters().prettier.formatPrettierFiles([ctx.resolve('ignored/file.js')]);

            expect(await ctx.read('ignored/file.js')).to.equal(unformatted.js);
        });

        withIgnored.test('.prettierignore returns text unchanged', async ctx => {
            await ctx.write('.prettierignore', 'ignored/\n');

            expect(
                await createFormatters().prettier.formatPrettierText(
                    unformatted.invalid,
                    ctx.resolve('ignored/file.js')
                )
            ).to.equal(unformatted.invalid);
        });
    });

    suite('formatPrettierFiles', () => {
        withTmpCwd.test('Reads .editorconfig', async ctx => {
            await ctx.write('.editorconfig', '[*]\nindent_style = tab\n');
            await ctx.write('file.js', unformatted.js);

            await createFormatters().prettier.formatPrettierFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Loads plugins named in the config', async ctx => {
            await ctx.write('.prettierrc', '{ "plugins": ["./plugin.mjs"] }');
            await ctx.write(
                'plugin.mjs',
                `
                    export const languages = [{ name: 'shout', parsers: ['shout'], extensions: ['.shout'] }];
                    export const parsers = {
                        shout: { parse: text => ({ text }), astFormat: 'shout', locStart: () => 0, locEnd: () => 0 },
                    };
                    export const printers = { shout: { print: path => path.node.text.trim().toUpperCase() } };
                `
            );
            await ctx.write('file.shout', '  hello  ');

            await createFormatters().prettier.formatPrettierFiles([ctx.resolve('file.shout')]);

            expect(await ctx.read('file.shout')).to.equal('HELLO');
        });

        withTmpCwd.test('Reads configuration afresh on each call', async ctx => {
            await ctx.write('file.js', unformatted.js);
            const { prettier } = createFormatters();

            await prettier.formatPrettierFiles([ctx.resolve('file.js')]);
            await ctx.write('.prettierrc', '{ "useTabs": true }');
            await prettier.formatPrettierFiles([ctx.resolve('file.js')]);

            expect(await ctx.read('file.js')).to.equal(formatted.biome);
        });

        withTmpCwd.test('Formats the other files, then rejects, when one fails', async ctx => {
            await ctx.write('first.js', unformatted.js);
            await ctx.write('invalid.js', unformatted.invalid);
            await ctx.write('second.js', unformatted.js);

            await expect(
                createFormatters().prettier.formatPrettierFiles([
                    ctx.resolve('first.js'),
                    ctx.resolve('invalid.js'),
                    ctx.resolve('second.js'),
                ])
            ).to.be.rejectedWith(AggregateError);

            expect(await ctx.read('first.js')).to.equal(formatted.prettier);
            expect(await ctx.read('invalid.js')).to.equal(unformatted.invalid);
            expect(await ctx.read('second.js')).to.equal(formatted.prettier);
        });

        withTmpCwd.test('Rejects a missing file', async ctx => {
            await expect(
                createFormatters().prettier.formatPrettierFiles([ctx.resolve('missing.js')])
            ).to.be.rejectedWith(AggregateError);
        });

        withTmpCwd.test('Rejects a file without an inferable parser', async ctx => {
            await ctx.write('file.unknown', unformatted.js);

            await expect(
                createFormatters().prettier.formatPrettierFiles([ctx.resolve('file.unknown')])
            ).to.be.rejectedWith(AggregateError);
        });

        withTmpCwd.test('Rejects a symbolic link, as the CLI does', async ctx => {
            await ctx.write('file.js', unformatted.js);
            await symlink(ctx.resolve('file.js'), ctx.resolve('link.js'));

            await expect(
                createFormatters().prettier.formatPrettierFiles([ctx.resolve('link.js')])
            ).to.be.rejectedWith(AggregateError);

            expect(await ctx.read('file.js')).to.equal(unformatted.js);
        });

        for (const directory of ['node_modules', '.git']) {
            withTmpCwd.test(`Skips files in ${directory}, as the CLI does`, async ctx => {
                await ctx.write(`${directory}/file.js`, unformatted.js);
                await ctx.write('file.js', unformatted.js);

                await createFormatters().prettier.formatPrettierFiles([
                    ctx.resolve(`${directory}/file.js`),
                    ctx.resolve('file.js'),
                ]);

                expect(await ctx.read(`${directory}/file.js`)).to.equal(unformatted.js);
                expect(await ctx.read('file.js')).to.equal(formatted.prettier);
            });

            withTmpCwd.test(
                `Rejects when every file is in ${directory}, as the CLI does`,
                async ctx => {
                    await ctx.write(`${directory}/file.js`, unformatted.js);

                    await expect(
                        createFormatters().prettier.formatPrettierFiles([
                            ctx.resolve(`${directory}/file.js`),
                        ])
                    ).to.be.rejectedWith(Error);

                    expect(await ctx.read(`${directory}/file.js`)).to.equal(unformatted.js);
                }
            );
        }

        withTmpCwd.test('Resolves relative paths from the working directory', async ctx => {
            await ctx.write('file.js', unformatted.js);

            await createFormatters().prettier.formatPrettierFiles(['file.js', './file.js']);

            expect(await ctx.read('file.js')).to.equal(formatted.prettier);
        });
    });

    suite('formatPrettierText', () => {
        withTmpCwd.test('Rejects a path without an inferable parser', async ctx => {
            await expect(
                createFormatters().prettier.formatPrettierText(
                    unformatted.js,
                    ctx.resolve('file.unknown')
                )
            ).to.be.rejectedWith(Error);
        });

        withTmpCwd.test('Keeps a byte order mark and CRLF line endings', async ctx => {
            await ctx.write('.prettierrc', '{ "endOfLine": "auto" }');

            expect(
                await createFormatters().prettier.formatPrettierText(
                    `\u{FEFF}${unformatted.js.replaceAll('\n', '\r\n')}`,
                    ctx.resolve('file.js')
                )
            ).to.equal(`\u{FEFF}${formatted.prettier.replaceAll('\n', '\r\n')}`);
        });
    });
});

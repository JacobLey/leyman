import { resolveConfigFile } from 'prettier';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createFormatters, createTmpCwd, formatted, unformatted } from '../helpers.js';

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
    });
});

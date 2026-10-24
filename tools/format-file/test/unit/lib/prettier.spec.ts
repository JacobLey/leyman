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

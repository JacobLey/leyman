import Path from 'node:path';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { loadGitignore } from '#internal/lib/gitignore.js';
import { createTmpDir } from '../../integration/lib/fixtures.js';

suite('gitignore', () => {
    const withTmpDir = beforeEach(createTmpDir);
    withTmpDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    suite('Patterns', () => {
        withTmpDir.test('Ignores nothing without a .gitignore', async ctx => {
            await ctx.writeFiles({ 'a.ts': '' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('a.ts')).to.equal(false);
        });

        withTmpDir.test('Matches a name at any depth', async ctx => {
            await ctx.writeFiles({ '.gitignore': 'generated.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('generated.ts')).to.equal(true);
            expect(isIgnored('sub/deep/generated.ts')).to.equal(true);
            expect(isIgnored('a.ts')).to.equal(false);
        });

        withTmpDir.test('Anchors a leading slash to the .gitignore directory', async ctx => {
            await ctx.writeFiles({ '.gitignore': '/generated.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('generated.ts')).to.equal(true);
            expect(isIgnored('sub/generated.ts')).to.equal(false);
        });

        withTmpDir.test('Directory patterns ignore their contents, not files', async ctx => {
            await ctx.writeFiles({ '.gitignore': 'dist/\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('dist/a.ts')).to.equal(true);
            expect(isIgnored('sub/dist/a.ts')).to.equal(true);
            expect(isIgnored('dist')).to.equal(false);
        });

        withTmpDir.test('Re-includes negated files', async ctx => {
            await ctx.writeFiles({ '.gitignore': '*.gen.ts\n!kept.gen.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('dropped.gen.ts')).to.equal(true);
            expect(isIgnored('kept.gen.ts')).to.equal(false);
        });

        withTmpDir.test('Cannot re-include a file in an ignored directory', async ctx => {
            await ctx.writeFiles({ '.gitignore': 'dist/\n!dist/kept.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('dist/kept.ts')).to.equal(true);
        });

        withTmpDir.test('Skips comments and blank lines', async ctx => {
            await ctx.writeFiles({ '.gitignore': '# a.ts\n\ngenerated.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('a.ts')).to.equal(false);
            expect(isIgnored('generated.ts')).to.equal(true);
        });
    });

    suite('Nested .gitignore files', () => {
        withTmpDir.test('Apply only within their directory', async ctx => {
            await ctx.writeFiles({ 'sub/.gitignore': 'generated.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('sub/generated.ts')).to.equal(true);
            expect(isIgnored('sub/deep/generated.ts')).to.equal(true);
            expect(isIgnored('generated.ts')).to.equal(false);
            expect(isIgnored('other/generated.ts')).to.equal(false);
        });

        withTmpDir.test('Anchor patterns to their own directory', async ctx => {
            await ctx.writeFiles({ 'sub/.gitignore': '/generated.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('sub/generated.ts')).to.equal(true);
            expect(isIgnored('sub/deep/generated.ts')).to.equal(false);
        });

        withTmpDir.test('Override rules from parent directories', async ctx => {
            await ctx.writeFiles({
                '.gitignore': '*.gen.ts\n',
                'sub/.gitignore': '!kept.gen.ts\n',
                'sub/deep/.gitignore': 'kept.gen.ts\n',
            });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('kept.gen.ts')).to.equal(true);
            expect(isIgnored('sub/kept.gen.ts')).to.equal(false);
            expect(isIgnored('sub/deep/kept.gen.ts')).to.equal(true);
        });

        withTmpDir.test('Cannot re-include files in a directory ignored by a parent', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'dist/\n',
                'dist/.gitignore': '!kept.ts\n',
            });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('dist/kept.ts')).to.equal(true);
        });

        withTmpDir.test('Skips node_modules', async ctx => {
            await ctx.writeFiles({ 'node_modules/pkg/.gitignore': 'a.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('node_modules/pkg/a.ts')).to.equal(false);
        });
    });

    suite('Parent .gitignore files', () => {
        withTmpDir.test('Apply up to the git root', async ctx => {
            await ctx.writeFiles({
                '.git/HEAD': '',
                '.gitignore': 'generated.ts\n',
                'pkg/.gitignore': 'other.ts\n',
                'pkg/sub/a.ts': '',
            });

            const isIgnored = await loadGitignore(ctx.resolve('pkg/sub'));

            expect(isIgnored('generated.ts')).to.equal(true);
            expect(isIgnored('other.ts')).to.equal(true);
            expect(isIgnored('a.ts')).to.equal(false);
        });

        withTmpDir.test('Skip directories without one', async ctx => {
            await ctx.writeFiles({
                '.git/HEAD': '',
                '.gitignore': 'generated.ts\n',
                'pkg/sub/a.ts': '',
            });

            const isIgnored = await loadGitignore(ctx.resolve('pkg/sub'));

            expect(isIgnored('generated.ts')).to.equal(true);
        });

        withTmpDir.test('Accept a .git file as the git root', async ctx => {
            await ctx.writeFiles({
                '.git': 'gitdir: ../.git/worktrees/repo\n',
                '.gitignore': 'generated.ts\n',
                'pkg/a.ts': '',
            });

            const isIgnored = await loadGitignore(ctx.resolve('pkg'));

            expect(isIgnored('generated.ts')).to.equal(true);
        });

        withTmpDir.test('Anchor patterns to their own directory', async ctx => {
            await ctx.writeFiles({
                '.git/HEAD': '',
                '.gitignore': '/pkg/generated.ts\n',
                'pkg/a.ts': '',
            });

            const isIgnored = await loadGitignore(ctx.resolve('pkg'));

            expect(isIgnored('generated.ts')).to.equal(true);
            expect(isIgnored('sub/generated.ts')).to.equal(false);
        });

        withTmpDir.test('Skip those above the git root', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'generated.ts\n',
                'repo/.git/HEAD': '',
            });

            const isIgnored = await loadGitignore(ctx.resolve('repo'));

            expect(isIgnored('generated.ts')).to.equal(false);
        });

        withTmpDir.test('Skip all outside a git repository', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'generated.ts\n',
                'pkg/a.ts': '',
            });

            const isIgnored = await loadGitignore(ctx.resolve('pkg'));

            expect(isIgnored('generated.ts')).to.equal(false);
        });

        withTmpDir.test('Throws when a .gitignore cannot be read', async ctx => {
            await ctx.writeFiles({
                '.git/HEAD': '',
                '.gitignore/a.ts': '',
                'pkg/a.ts': '',
            });

            await expect(loadGitignore(ctx.resolve('pkg'))).to.eventually.be.rejectedWith(Error);
        });
    });

    suite('Paths', () => {
        withTmpDir.test('Accepts absolute paths', async ctx => {
            await ctx.writeFiles({ '.gitignore': 'generated.ts\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored(ctx.resolve('generated.ts'))).to.equal(true);
        });

        withTmpDir.test('Never ignores the root or paths outside it', async ctx => {
            await ctx.writeFiles({ '.gitignore': '*\n' });

            const isIgnored = await loadGitignore(ctx.tmpDir.path);

            expect(isIgnored('.')).to.equal(false);
            expect(isIgnored('..')).to.equal(false);
            expect(isIgnored(Path.join('..', 'generated.ts'))).to.equal(false);
        });
    });
});

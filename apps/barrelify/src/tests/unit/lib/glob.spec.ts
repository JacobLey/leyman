import type { Globby } from '../../../lib/dependencies.js';
import type { IsExplicitlyModuleDirectory } from '../../../lib/find-package-json.js';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Glob } from '../../../lib/glob.js';
import { expect } from '../../chai-hooks.js';

suite('FindPackageJson', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedGlobby = stubMethod<Globby>();
        const stubbedIsExplicitlyModuleDirectory = stubMethod<IsExplicitlyModuleDirectory>();
        return {
            stubbedGlobby: stubbedGlobby.stub,
            stubbedIsExplicitlyModuleDirectory: stubbedIsExplicitlyModuleDirectory.stub,
            glob: new Glob(stubbedGlobby.method, stubbedIsExplicitlyModuleDirectory.method),
        };
    });

    suite('findIndexFiles', () => {
        withStubs.test('Uses unix separator', async ctx => {
            ctx.stubbedGlobby.resolves(['<filename>']);

            expect(
                await ctx.glob.findIndexFiles({
                    dir: '<dir>',
                    ignore: ['./foo/bar/index.ts', String.raw`\root\files\to\ignore\**`],
                })
            ).to.deep.equal(['<filename>']);

            expect(
                ctx.stubbedGlobby.calledOnceWithExactly(
                    [
                        '**/index.?(c|m)ts',
                        '!**/node_modules/**',
                        '!./foo/bar/index.ts',
                        '!/root/files/to/ignore/**',
                    ],
                    { cwd: '<dir>', gitignore: true }
                )
            ).to.equal(true);
        });
    });

    suite('findFilesForIndex', () => {
        withStubs.test('File is .ts and uses ESM', async ctx => {
            ctx.stubbedIsExplicitlyModuleDirectory.resolves(true);
            ctx.stubbedGlobby.resolves(['<filename>']);

            expect(await ctx.glob.findFilesForIndex('foo/bar/filename.ts')).to.deep.equal([
                '<filename>',
            ]);

            expect(
                ctx.stubbedIsExplicitlyModuleDirectory.calledOnceWithExactly('foo/bar/filename.ts')
            ).to.equal(true);
            expect(
                ctx.stubbedGlobby.calledOnceWithExactly([`*.?(c|m)ts`, '!index.?(c|m)ts'], {
                    cwd: 'foo/bar',
                    gitignore: true,
                })
            ).to.equal(true);
        });

        withStubs.test('File is .mts', async ctx => {
            ctx.stubbedGlobby.resolves(['<filename>']);

            expect(await ctx.glob.findFilesForIndex('foo/bar/filename.mts')).to.deep.equal([
                '<filename>',
            ]);

            expect(ctx.stubbedIsExplicitlyModuleDirectory.notCalled).to.equal(true);
            expect(
                ctx.stubbedGlobby.calledOnceWithExactly([`*.?(c|m)ts`, '!index.?(c|m)ts'], {
                    cwd: 'foo/bar',
                    gitignore: true,
                })
            ).to.equal(true);
        });

        withStubs.test('File is .ts and does not use ESM', async ctx => {
            ctx.stubbedIsExplicitlyModuleDirectory.withArgs('foo/bar/filename.ts').resolves(false);
            ctx.stubbedGlobby.resolves(['<filename>']);

            expect(await ctx.glob.findFilesForIndex('foo/bar/filename.ts')).to.deep.equal([
                '<filename>',
            ]);

            expect(
                ctx.stubbedGlobby.calledOnceWithExactly([`*.?(c)ts`, '!index.?(c|m)ts'], {
                    cwd: 'foo/bar',
                    gitignore: true,
                })
            ).to.equal(true);
        });

        withStubs.test('File is .cts and uses ESM', async ctx => {
            ctx.stubbedIsExplicitlyModuleDirectory.withArgs('foo/bar/filename.cts').resolves(true);
            ctx.stubbedGlobby.resolves(['<filename>']);

            expect(await ctx.glob.findFilesForIndex('foo/bar/filename.cts')).to.deep.equal([
                '<filename>',
            ]);

            expect(
                ctx.stubbedGlobby.calledOnceWithExactly([`*.cts`, '!index.?(c|m)ts'], {
                    cwd: 'foo/bar',
                    gitignore: true,
                })
            ).to.equal(true);
        });

        withStubs.test('File is .cts and does not use ESM', async ctx => {
            ctx.stubbedIsExplicitlyModuleDirectory.withArgs('foo/bar/filename.cts').resolves(false);
            ctx.stubbedGlobby.resolves(['<filename>']);

            expect(await ctx.glob.findFilesForIndex('foo/bar/filename.cts')).to.deep.equal([
                '<filename>',
            ]);

            expect(
                ctx.stubbedGlobby.calledOnceWithExactly([`*.?(c)ts`, '!index.?(c|m)ts'], {
                    cwd: 'foo/bar',
                    gitignore: true,
                })
            ).to.equal(true);
        });
    });
});

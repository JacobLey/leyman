import type { PopulateFile } from 'npm-populate-files';
import { createStubInstance, stub, verifyAndRestore } from 'sinon';
import { dedent } from 'ts-dedent';
import { afterEach, beforeEach, suite, test } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Barrel } from '../../../lib/barrel.js';
import type { ReadFile } from '../../../lib/dependencies.js';
import { Glob } from '../../../lib/glob.js';
import { expect } from '../../chai-hooks.js';

suite('barrel', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedReadFile = stubMethod<ReadFile>();
        const stubbedPopulateFile = stubMethod<PopulateFile>();
        const stubbedGlob = createStubInstance(Glob);
        return {
            stubbedGlob,
            stubbedReadFile: stubbedReadFile.stub,
            stubbedPopulateFile: stubbedPopulateFile.stub,
            barrel: stub(
                new Barrel(stubbedReadFile.method, stubbedPopulateFile.method, stubbedGlob)
            ),
        };
    });

    suite('barrelFiles', () => {
        withStubs.beforeEach(ctx => {
            ctx.barrel.barrelFiles.callThrough();
        });

        withStubs.test('Reports updated files', async ctx => {
            ctx.stubbedGlob.findIndexFiles.resolves(['foo/file.ts', 'bar/file.ts']);

            ctx.barrel.barrelFile
                .withArgs({
                    dryRun: false,
                    filePath: '/root/dir/foo/file.ts',
                })
                .resolves(false);

            ctx.barrel.barrelFile
                .withArgs({
                    dryRun: false,
                    filePath: '/root/dir/bar/file.ts',
                })
                .resolves(true);

            const response = await ctx.barrel.barrelFiles({
                cwd: '/root/dir',
                dryRun: false,
                ignore: ['<to>', '<ignore>'],
            });
            expect(response).to.deep.equal(['/root/dir/bar/file.ts']);

            expect(
                ctx.stubbedGlob.findIndexFiles.calledOnceWithExactly({
                    dir: '/root/dir',
                    ignore: ['<to>', '<ignore>'],
                })
            ).to.equal(true);
            expect(ctx.barrel.barrelFile.calledTwice).to.equal(true);
            expect(
                ctx.barrel.barrelFile.calledWithExactly({
                    dryRun: false,
                    filePath: '/root/dir/foo/file.ts',
                })
            ).to.equal(true);
            expect(
                ctx.barrel.barrelFile.calledWithExactly({
                    dryRun: false,
                    filePath: '/root/dir/bar/file.ts',
                })
            ).to.equal(true);
        });
    });

    suite('barrelFile', () => {
        withStubs.beforeEach(ctx => {
            ctx.barrel.barrelFile.callThrough();
        });

        withStubs.test('Populates file with header', async ctx => {
            ctx.stubbedReadFile.resolves(dedent`
                // AUTO-BARREL
            `);
            ctx.stubbedGlob.findFilesForIndex.resolves(['/foo/a.ts', '/foo/b.ts']);
            ctx.stubbedPopulateFile.resolves({
                updated: true,
                filePath: '<file-path>',
                reason: 'file-not-exist',
            });

            expect(
                await ctx.barrel.barrelFile({ dryRun: false, filePath: '<file-path>' })
            ).to.equal(true);

            expect(ctx.stubbedReadFile.calledOnceWithExactly('<file-path>', 'utf8')).to.equal(true);
            expect(ctx.stubbedGlob.findFilesForIndex.calledOnceWithExactly('<file-path>')).to.equal(
                true
            );
            expect(
                ctx.stubbedPopulateFile.calledOnceWithExactly(
                    {
                        filePath: '<file-path>',
                        content: dedent`
                        // AUTO-BARREL

                        export * from './a.js';
                        export * from './b.js';

                    `,
                    },
                    {
                        check: false,
                        dryRun: false,
                    }
                )
            ).to.equal(true);
        });

        withStubs.test('Skips files without header', async ctx => {
            ctx.stubbedReadFile.resolves('Literally anything else');
            ctx.stubbedPopulateFile.resolves({
                updated: false,
                filePath: '<file-path>',
            });

            expect(
                await ctx.barrel.barrelFile({ dryRun: false, filePath: '<file-path>' })
            ).to.equal(false);

            expect(ctx.stubbedGlob.findFilesForIndex.notCalled).to.equal(true);
        });

        withStubs.test('Passes dryRun to populateFile', async ctx => {
            ctx.stubbedReadFile.resolves(dedent`
                // AUTO-BARREL
            `);
            ctx.stubbedGlob.findFilesForIndex.resolves(['/foo/a.ts', '/foo/b.ts']);
            ctx.stubbedPopulateFile.resolves({
                updated: true,
                filePath: '<file-path>',
                reason: 'file-not-exist',
            });

            expect(await ctx.barrel.barrelFile({ dryRun: true, filePath: '<file-path>' })).to.equal(
                true
            );
            expect(
                ctx.stubbedPopulateFile.calledOnceWithExactly(
                    {
                        filePath: '<file-path>',
                        content: dedent`
                        // AUTO-BARREL

                        export * from './a.js';
                        export * from './b.js';

                    `,
                    },
                    {
                        check: false,
                        dryRun: true,
                    }
                )
            ).to.equal(true);
        });
    });

    suite('parseTypes', () => {
        test('Detects javascript files', () => {
            expect(
                Barrel.parseTypes(dedent`
                    // AUTO BARREL

                    export type * from './bar.mjs';
                    export type * from './baz.cjs';
                    export type * from './foo.js';
                    export * from './ignore.js';

                `)
            ).to.deep.equal(
                new Set(['bar.mjs', 'bar.mts', 'baz.cjs', 'baz.cts', 'foo.js', 'foo.ts'])
            );
        });

        test('Detects typescript files', () => {
            expect(
                Barrel.parseTypes(dedent`
                    // AUTO BARREL

                    export type * from './bar.mts';
                    export type * from './baz.cts';
                    export type * from './foo.ts';
                    export * from './ignore.ts';

                `)
            ).to.deep.equal(
                new Set(['bar.mjs', 'bar.mts', 'baz.cjs', 'baz.cts', 'foo.js', 'foo.ts'])
            );
        });
    });

    suite('generateBarrelFile', () => {
        test('empty file', () => {
            expect(
                Barrel.generateBarrelFile({
                    files: ['foo.ts', 'bar.mts', 'baz.cts'],
                    types: new Set(),
                })
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './bar.mjs';
                    export * from './baz.cjs';
                    export * from './foo.js';

                `
            );
        });

        test('Files declared with types', () => {
            expect(
                Barrel.generateBarrelFile({
                    files: ['foo.ts', 'bar.mts', 'baz.cts'],
                    types: new Set(['foo.js', 'ignore.js', 'baz.cjs']),
                })
            ).to.equal(
                dedent`
                    // AUTO-BARREL

                    export * from './bar.mjs';
                    export type * from './baz.cjs';
                    export type * from './foo.js';

                `
            );
        });
    });
});

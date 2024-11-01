import { expect } from 'chai';
import { createStubInstance, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { BarrelifyApi } from '../../barrelify-api.js';
import { Barrel } from '../../lib/barrel.js';
import type { ParseCwd } from '../../lib/dependencies.js';

suite('BarrelifyApi', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedBarrel = createStubInstance(Barrel);
        const stubbedParseCwd = stubMethod<ParseCwd>();
        return {
            stubbedBarrel,
            stubbedParseCwd: stubbedParseCwd.stub,
            barrelifyApi: new BarrelifyApi(stubbedBarrel, stubbedParseCwd.method),
        };
    });

    suite('barrelify', () => {
        withStubs.test('Applies defaults and calls internal method', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedBarrel.barrelFiles.resolves(['<file-1>', '<file-2>']);

            expect(
                await ctx.barrelifyApi.barrelify({
                    cwd: '<cwd>',
                    dryRun: true,
                    ignore: ['<ignore>'],
                })
            ).to.deep.equal(['<file-1>', '<file-2>']);

            expect(ctx.stubbedParseCwd.calledOnceWithExactly('<cwd>')).to.equal(true);
            expect(
                ctx.stubbedBarrel.barrelFiles.calledOnceWithExactly({
                    cwd: '<resolved-cwd>',
                    dryRun: true,
                    ignore: ['<ignore>'],
                })
            ).to.equal(true);
        });

        withStubs.test('Options are optional', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedBarrel.barrelFiles.resolves(['<file-1>', '<file-2>']);

            expect(await ctx.barrelifyApi.barrelify({})).to.deep.equal(['<file-1>', '<file-2>']);

            expect(ctx.stubbedParseCwd.calledOnceWithExactly(null)).to.equal(true);
            expect(
                ctx.stubbedBarrel.barrelFiles.calledOnceWithExactly({
                    cwd: '<resolved-cwd>',
                    dryRun: false,
                    ignore: [],
                })
            ).to.equal(true);
        });
    });
});

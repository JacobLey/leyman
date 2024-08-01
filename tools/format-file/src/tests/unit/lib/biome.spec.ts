import { expect } from 'chai';
import type { findUp } from 'find-up';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Biome } from '#lib';
import type { Executor } from '#types';

suite('Biome', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedExecutor = stubMethod<Executor>();
        const stubbedFindUp = stubMethod<typeof findUp>();
        const stubbedGetBiomePath = stubMethod<() => string>();
        return {
            stubbedExecutor: stubbedExecutor.stub,
            stubbedFindUp: stubbedFindUp.stub,
            stubbedGetBiomePath: stubbedGetBiomePath.stub,
            biome: new Biome(
                stubbedExecutor.method,
                stubbedFindUp.method,
                stubbedGetBiomePath.method
            ),
        };
    });

    suite('canUseBiome', () => {
        withStubs.test('Has valid config', async ctx => {
            ctx.stubbedGetBiomePath.returns('<path>');
            ctx.stubbedFindUp.resolves('<file>');

            expect(await ctx.biome.canUseBiome()).to.equal(2);

            expect(ctx.stubbedFindUp.calledWith(['biome.json', 'biome.jsonc'])).to.equal(true);
        });

        withStubs.test('Missing valid config', async ctx => {
            ctx.stubbedGetBiomePath.returns('<path>');
            ctx.stubbedFindUp.resolves();

            expect(await ctx.biome.canUseBiome()).to.equal(1);
        });

        withStubs.test('Fails to get path', async ctx => {
            ctx.stubbedGetBiomePath.throws();

            expect(await ctx.biome.canUseBiome()).to.equal(0);

            expect(ctx.stubbedFindUp.notCalled).to.equal(true);
        });
    });

    withStubs.test('formatBiomeFiles', async ctx => {
        ctx.stubbedGetBiomePath.returns('<biome>');
        ctx.stubbedExecutor.resolves();

        await ctx.biome.formatBiomeFiles(['<path-1>', '<path-2>']);

        expect(
            ctx.stubbedExecutor.calledWith('<biome>', ['format', '--write', '<path-1>', '<path-2>'])
        ).to.equal(true);
    });
});

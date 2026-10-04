import type { findUp } from 'find-up';
import { verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Biome } from '#lib';

suite('Biome', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedGetBiomePath = stubMethod<() => string>();
        const stubbedFindUp = stubMethod<typeof findUp>();
        return {
            stubbedGetBiomePath: stubbedGetBiomePath.stub,
            stubbedFindUp: stubbedFindUp.stub,
            biome: new Biome(stubbedGetBiomePath.method, stubbedFindUp.method),
        };
    });

    suite('canUseBiome', () => {
        withStubs.test('Has valid config', async ctx => {
            ctx.stubbedGetBiomePath.returns('<path>');
            ctx.stubbedFindUp.withArgs(['biome.json', 'biome.jsonc']).resolves('<file>');

            expect(await ctx.biome.canUseBiome()).to.equal(2);
        });

        withStubs.test('Missing valid config', async ctx => {
            ctx.stubbedGetBiomePath.returns('<path>');
            ctx.stubbedFindUp.resolves();

            expect(await ctx.biome.canUseBiome()).to.equal(1);
        });

        withStubs.test('Fails to get path', async ctx => {
            ctx.stubbedGetBiomePath.throws();

            expect(await ctx.biome.canUseBiome()).to.equal(0);
        });
    });
});

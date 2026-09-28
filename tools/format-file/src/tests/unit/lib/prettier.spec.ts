import type { resolveConfig } from 'prettier';
import { expect } from 'chai';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Prettier } from '#lib';

suite('Prettier', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedGetPrettierPath = stubMethod<() => string>();
        const stubbedGetResolveConfig = stubMethod<() => Promise<typeof resolveConfig>>();
        return {
            stubbedGetPrettierPath: stubbedGetPrettierPath.stub,
            stubbedGetResolveConfig: stubbedGetResolveConfig.stub,
            prettier: new Prettier(stubbedGetPrettierPath.method, stubbedGetResolveConfig.method),
        };
    });

    suite('canUsePrettier', () => {
        withStubs.test('Has valid config', async ctx => {
            ctx.stubbedGetPrettierPath.returns('<path>');
            const stubbedResolveConfig = stubMethod<typeof resolveConfig>();
            ctx.stubbedGetResolveConfig.resolves(stubbedResolveConfig.method);
            stubbedResolveConfig.stub.resolves({});

            expect(await ctx.prettier.canUsePrettier()).to.equal(2);
        });

        withStubs.test('Missing valid config', async ctx => {
            ctx.stubbedGetPrettierPath.returns('<path>');
            const stubbedResolveConfig = stubMethod<typeof resolveConfig>();
            ctx.stubbedGetResolveConfig.resolves(stubbedResolveConfig.method);
            stubbedResolveConfig.stub.resolves(null);

            expect(await ctx.prettier.canUsePrettier()).to.equal(1);
        });

        withStubs.test('Fails to get resolveConfig', async ctx => {
            ctx.stubbedGetPrettierPath.returns('<path>');
            ctx.stubbedGetResolveConfig.rejects();

            expect(await ctx.prettier.canUsePrettier()).to.equal(1);
        });

        withStubs.test('Fails to get path', async ctx => {
            ctx.stubbedGetPrettierPath.throws();

            expect(await ctx.prettier.canUsePrettier()).to.equal(0);
        });
    });
});

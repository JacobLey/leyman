import type { NxDagger } from '../../../../generate/nx-dagger.js';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { DaggerGenerate } from '../../../../executors/generate/generate.js';
import { expect } from '../../../chai-hooks.js';

suite('Lifecycle', () => {
    const stubs = beforeEach(() => {
        const stubbedNxDagger = stubMethod<NxDagger>();

        return {
            stubbedNxDagger: stubbedNxDagger.stub,
            daggerGenerate: new DaggerGenerate(stubbedNxDagger.method),
        };
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('generate', () => {
        stubs.test('Calls internal generate and returns success', async ctx => {
            ctx.stubbedNxDagger.resolves();

            expect(
                await ctx.daggerGenerate.generate(
                    {},
                    {
                        projectGraph: {
                            nodes: {},
                            dependencies: {},
                        },
                    }
                )
            ).to.deep.equal({ success: true });

            expect(ctx.stubbedNxDagger.callCount).to.equal(1);
            expect(ctx.stubbedNxDagger.getCall(0).args).to.deep.equal([
                {
                    nodes: {},
                    dependencies: {},
                },
                {},
            ]);
        });
    });
});

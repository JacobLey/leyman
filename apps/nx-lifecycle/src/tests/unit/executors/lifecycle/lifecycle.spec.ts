import type { ILifecycleInternal } from '../../../../lifecycle/lifecycle-internal.js';
import type { LifecycleOptionsOrConfig } from '../../../../lifecycle/schema.js';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { mockMethod } from 'sinon-typed-stub';
import { Lifecycle } from '../../../../executors/lifecycle/lifecycle.js';
import { expect } from '../../../chai-hooks.js';

suite('Lifecycle', () => {
    const stubs = beforeEach(() => {
        const mockedLifecycleInternal = mockMethod<ILifecycleInternal>();

        return {
            mockedLifecycleInternal: mockedLifecycleInternal.mock,
            lifecycle: new Lifecycle(mockedLifecycleInternal.method),
        };
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('lifecycle', () => {
        stubs.test('Maps nx context to internal', async ctx => {
            ctx.mockedLifecycleInternal.resolves();

            const fakeOptions = {
                stages: {
                    stage: {},
                },
                bindings: {
                    bind: '',
                },
            } satisfies LifecycleOptionsOrConfig;

            expect(
                await ctx.lifecycle.lifecycle(fakeOptions, {
                    root: '<root>',
                    projectsConfigurations: {
                        version: 123,
                        projects: {
                            foo: {
                                root: '<foo-root>',
                                name: '<foo>',
                            },
                            bar: {
                                root: '<bar-root>',
                                name: '<bar>',
                            },
                        },
                    },
                })
            ).to.deep.equal({ success: true });

            expect(ctx.mockedLifecycleInternal.callCount).to.equal(1);
            expect(ctx.mockedLifecycleInternal.getCall(0).args).to.deep.equal([
                fakeOptions,
                {
                    root: '<root>',
                    projects: [
                        {
                            root: '<foo-root>',
                            name: '<foo>',
                        },
                        {
                            root: '<bar-root>',
                            name: '<bar>',
                        },
                    ],
                },
            ]);
        });
    });
});

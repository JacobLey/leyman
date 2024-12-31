import { expect } from 'chai';
import type {
    AsyncFunc,
    Done,
    Func,
    Hook,
    HookFunction,
    Context as MochaContext,
    Suite,
    SuiteFunction,
    TestFunction,
} from 'mocha';
import { match, mock, stub, verifyAndRestore } from 'sinon';
import { bind, createContainer, createModule } from 'haywire';
import { after, afterEach, before, suite, test } from 'mocha-chain';
import { contextualHookModule } from '#contextual-module';
import {
    afterEachIdentifier,
    afterIdentifier,
    beforeEachIdentifier,
    beforeIdentifier,
    suiteIdentifier,
    testIdentifier,
} from '#mocha-module';
import { entrypointBeforeEachIdentifier } from '../../../lib/before-each-hooks.js';
import { entrypointBeforeIdentifier } from '../../../lib/before-hooks.js';
import { entrypointTestIdentifier } from '../../../lib/test-hooks.js';

suite('Failure cases', () => {
    const fakeCurrentTest = {};
    const fakeContext = {
        currentTest: fakeCurrentTest,
        runnable: () => ({
            duration: 1,
        }),
    } as MochaContext;
    const defaultBaseSuite = (_title: string, cb: (this: Suite) => void) => {
        const suiteContext = {} as Suite;
        cb.call(suiteContext);
        return suiteContext;
    };
    const defaultSuite = Object.assign(defaultBaseSuite, {
        skip: defaultBaseSuite,
        only: defaultBaseSuite,
    }) as SuiteFunction;
    const defaultHook: HookFunction<Hook> = (...args) => {
        const cb = [...args].pop() as AsyncFunc | Func;
        cb.call(fakeContext, () => {});
        return {} as Hook;
    };
    const defaultBaseTest = (_title: string, cb: AsyncFunc | Func) => {
        cb.call(
            {
                test: fakeCurrentTest,
            } as MochaContext,
            () => {}
        );
        return {};
    };
    const defaultTest = Object.assign(defaultBaseTest, {
        skip: defaultBaseTest,
        only: defaultBaseTest,
    }) as TestFunction;

    suite('Test failure', () => {
        const beforeModule = before(() => {
            const defaultHooksModule = createModule(
                bind(suiteIdentifier).withInstance(defaultSuite)
            )
                .addBinding(bind(beforeIdentifier).withInstance(defaultHook))
                .addBinding(bind(beforeEachIdentifier).withInstance(defaultHook))
                .addBinding(bind(afterEachIdentifier).withInstance(defaultHook))
                .addBinding(bind(afterIdentifier).withInstance(defaultHook));

            return {
                module: contextualHookModule.mergeModule(defaultHooksModule),
            };
        });

        beforeModule.test('Test with done returns truthy', function (this, ctx, done) {
            // Trick lock into thinking test is complete
            this.runnable().duration = -1;

            const stubDone = stub();
            const fakeBaseTest = (_title: string, cb: AsyncFunc | Func) => {
                cb.call(fakeContext, stubDone as Done);
            };

            stubDone.withArgs().returns(null);
            stubDone.withArgs(match.string).callsFake(arg => {
                expect(arg).to.equal('Test returned truthy value: true');
                done();
            });

            const fakeTest = createContainer(
                ctx.module.addBinding(
                    bind(testIdentifier).withInstance(
                        Object.assign(fakeBaseTest, {
                            skip: fakeBaseTest,
                            only: fakeBaseTest,
                        }) as TestFunction
                    )
                )
            ).get(entrypointTestIdentifier);

            fakeTest('Will return true', (doneCb): false => {
                doneCb();

                return true as false;
            });
        });

        beforeModule.test('Test with done throws an error', function (this, ctx, done) {
            // Trick lock into thinking test is complete
            this.runnable().duration = -1;

            const mockDone = mock();
            const fakeBaseTest = (_title: string, cb: AsyncFunc | Func) => {
                cb.call(fakeContext, mockDone as Done);
            };

            mockDone.withArgs(match(err => err instanceof Error)).callsFake(arg => {
                expect(arg).to.be.an.instanceOf(Error).that.contains({
                    message: '<ERROR>',
                });
                done();
            });

            const fakeTest = createContainer(
                ctx.module.addBinding(
                    bind(testIdentifier).withInstance(
                        Object.assign(fakeBaseTest, {
                            skip: fakeBaseTest,
                            only: fakeBaseTest,
                        }) as TestFunction
                    )
                )
            ).get(entrypointTestIdentifier);

            fakeTest('Will return true', doneCb => {
                if (Math.random()) {
                    throw new Error('<ERROR>');
                }
                doneCb();
            });
        });

        test('Test declared inside a test', () => {
            expect(() => test('This will never run', () => {}))
                .to.throw(Error)
                .that.contains({
                    message: 'Cannot create new hook/suite/test while executing a hook/test',
                });
        });
    });

    suite('Hooks failure', () => {
        const beforeModule = before(() => {
            const missingBeforeModule = createModule(
                bind(suiteIdentifier).withInstance(defaultSuite)
            )
                .addBinding(bind(testIdentifier).withInstance(defaultTest))
                .addBinding(bind(afterEachIdentifier).withInstance(defaultHook))
                .addBinding(bind(afterIdentifier).withInstance(defaultHook));

            return {
                module: contextualHookModule.mergeModule(missingBeforeModule),
            };
        });

        beforeModule.test('One-time hook with done throws an error', function (this, ctx, done) {
            // Trick lock into thinking test is complete
            this.runnable().duration = -1;

            const mockDone = mock();
            const fakeHook = (cb: AsyncFunc | Func) => {
                cb.call(fakeContext, mockDone as Done);
                return {} as Hook;
            };

            mockDone.withArgs(match(err => err instanceof Error)).callsFake(arg => {
                expect(arg).to.be.an.instanceOf(Error).that.contains({
                    message: '<ERROR>',
                });
                done();
            });

            const customBefore = createContainer(
                ctx.module
                    .addBinding(bind(beforeIdentifier).withInstance(fakeHook as HookFunction<Hook>))
                    .addBinding(bind(beforeEachIdentifier).withInstance(defaultHook))
            ).get(entrypointBeforeIdentifier);

            customBefore(doneCb => {
                if (Math.random()) {
                    throw new Error('<ERROR>');
                }
                doneCb();
            });
        });

        beforeModule.test('Per-test hook with done throws an error', function (this, ctx, done) {
            // Trick lock into thinking test is complete
            this.runnable().duration = -1;

            const mockDone = mock();
            const fakeHook = (cb: AsyncFunc | Func) => {
                cb.call(fakeContext, mockDone as Done);
            };

            mockDone.withArgs(match(err => err instanceof Error)).callsFake(arg => {
                expect(arg).to.be.an.instanceOf(Error).that.contains({
                    message: '<ERROR>',
                });
                done();
            });

            const beforeEach = createContainer(
                ctx.module
                    .addBinding(
                        bind(beforeEachIdentifier).withInstance(fakeHook as HookFunction<Hook>)
                    )
                    .addBinding(bind(beforeIdentifier).withInstance(defaultHook))
            ).get(entrypointBeforeEachIdentifier);

            beforeEach(doneCb => {
                if (Math.random()) {
                    throw new Error('<ERROR>');
                }
                doneCb();
            });
        });

        after('Test declared inside a hook', () => {
            expect(() => test('This will never run', () => {})).to.throw(
                Error,
                'Cannot create new hook/suite/test while executing a hook/test'
            );
        });
    });

    afterEach(() => {
        verifyAndRestore();
    });
});

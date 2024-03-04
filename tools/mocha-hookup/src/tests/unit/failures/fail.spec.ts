import { expect } from 'chai';
import { bind, createContainer, createModule } from 'haystack-di';
import type {
    Context as MochaContext,
    Done,
    HookFunction,
    TestFunction,
} from 'mocha';
import { after, afterEach, before, suite, test } from 'mocha-hookup';
import { match, mock, stub, verifyAndRestore } from 'sinon';
import { contextualHookModule } from '#contextual-module';
import {
    afterEachIdentifier,
    afterIdentifier,
    beforeEachIdentifier,
    beforeIdentifier,
    testIdentifier,
} from '#mocha-module';
import { entrypointBeforeIdentifier } from '../../../lib/before-hooks.js';
import { entrypointBeforeEachIdentifier } from '../../../lib/before-each-hooks.js';
import { entrypointTestIdentifier } from '../../../lib/test-hooks.js';

suite('Failure cases', () => {
    const fakeCurrentTest = {};
    const fakeContext = {
        currentTest: fakeCurrentTest,
        runnable: () => ({
            duration: 1,
        }),
    } as MochaContext;
    const defaultHook: HookFunction = (...args) => {
        const cb = args.slice().pop() as Mocha.Func | Mocha.AsyncFunc;
        cb.call(fakeContext, () => {});
        return {};
    };
    const defaultBaseTest = (
        title: string,
        cb: Mocha.Func | Mocha.AsyncFunc
    ) => {
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
                bind(beforeIdentifier).withInstance(defaultHook)
            )
                .addBinding(
                    bind(beforeEachIdentifier).withInstance(defaultHook)
                )
                .addBinding(bind(afterEachIdentifier).withInstance(defaultHook))
                .addBinding(bind(afterIdentifier).withInstance(defaultHook));

            return {
                module: contextualHookModule.mergeModule(defaultHooksModule),
            };
        });

        beforeModule.test(
            'Test with done returns truthy',
            function (ctx, done) {
                // Trick lock into thinking test is complete
                this.runnable().duration = -1;

                const stubDone = stub();
                const fakeBaseTest = (
                    title: string,
                    cb: Mocha.Func | Mocha.AsyncFunc
                ) => {
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
                ).getSync(entrypointTestIdentifier);

                fakeTest('Will return true', (doneCb): false => {
                    doneCb();

                    return true as false;
                });
            }
        );

        beforeModule.test(
            'Test with done throws an error',
            function (ctx, done) {
                // Trick lock into thinking test is complete
                this.runnable().duration = -1;

                const mockDone = mock();
                const fakeBaseTest = (
                    title: string,
                    cb: Mocha.Func | Mocha.AsyncFunc
                ) => {
                    cb.call(fakeContext, mockDone as Done);
                };

                mockDone
                    .withArgs(match(err => err instanceof Error))
                    .callsFake(arg => {
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
                ).getSync(entrypointTestIdentifier);

                fakeTest('Will return true', doneCb => {
                    if (Math.random()) {
                        throw new Error('<ERROR>');
                    }
                    doneCb();
                });
            }
        );

        test('Test declared inside a test', () => {
            expect(() => test('This will never run', () => {}))
                .to.throw(Error)
                .that.contains({
                    message:
                        'Cannot create new hook/suite/test while executing a hook/test',
                });
        });
    });

    suite('Hooks failure', () => {
        const beforeModule = before(() => {
            const missingBeforeModule = createModule(
                bind(testIdentifier).withInstance(defaultTest)
            )
                .addBinding(bind(afterEachIdentifier).withInstance(defaultHook))
                .addBinding(bind(afterIdentifier).withInstance(defaultHook));

            return {
                module: contextualHookModule.mergeModule(missingBeforeModule),
            };
        });

        beforeModule.test(
            'One-time hook with done throws an error',
            function (ctx, done) {
                // Trick lock into thinking test is complete
                this.runnable().duration = -1;

                const mockDone = mock();
                const fakeHook = (cb: Mocha.Func | Mocha.AsyncFunc) => {
                    cb.call(fakeContext, mockDone as Done);
                };

                mockDone
                    .withArgs(match(err => err instanceof Error))
                    .callsFake(arg => {
                        expect(arg).to.be.an.instanceOf(Error).that.contains({
                            message: '<ERROR>',
                        });
                        done();
                    });

                const before = createContainer(
                    ctx.module
                        .addBinding(
                            bind(beforeIdentifier).withInstance(
                                fakeHook as HookFunction
                            )
                        )
                        .addBinding(
                            bind(beforeEachIdentifier).withInstance(defaultHook)
                        )
                ).getSync(entrypointBeforeIdentifier);

                before(doneCb => {
                    if (Math.random()) {
                        throw new Error('<ERROR>');
                    }
                    doneCb();
                });
            }
        );

        beforeModule.test(
            'Per-test hook with done throws an error',
            function (ctx, done) {
                // Trick lock into thinking test is complete
                this.runnable().duration = -1;

                const mockDone = mock();
                const fakeHook = (cb: Mocha.Func | Mocha.AsyncFunc) => {
                    cb.call(fakeContext, mockDone as Done);
                };

                mockDone
                    .withArgs(match(err => err instanceof Error))
                    .callsFake(arg => {
                        expect(arg).to.be.an.instanceOf(Error).that.contains({
                            message: '<ERROR>',
                        });
                        done();
                    });

                const beforeEach = createContainer(
                    ctx.module
                        .addBinding(
                            bind(beforeEachIdentifier).withInstance(
                                fakeHook as HookFunction
                            )
                        )
                        .addBinding(
                            bind(beforeIdentifier).withInstance(defaultHook)
                        )
                ).getSync(entrypointBeforeEachIdentifier);

                beforeEach(doneCb => {
                    if (Math.random()) {
                        throw new Error('<ERROR>');
                    }
                    doneCb();
                });
            }
        );

        after('Test declared inside a hook', () => {
            expect(() => test('This will never run', () => {}))
                .to.throw(Error)
                .that.contains({
                    message:
                        'Cannot create new hook/suite/test while executing a hook/test',
                });
        });
    });

    afterEach(() => {
        verifyAndRestore();
    });
});

import type {
    Done,
    Func,
    Hook,
    HookFunction,
    Context as MochaContext,
    Suite,
    SuiteFunction,
    TestFunction,
} from 'mocha';
import type { MochaMethods } from '#internal/lib/mocha-chain.js';
import * as mocha from 'mocha';
import { match, mock, stub, verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { after, afterEach, suite, test } from 'mocha-chain';
import { createMochaChain } from '#internal/lib/mocha-chain.js';

suite('Failure cases', () => {
    const fakeCurrentTest = {};
    const fakeContext = {
        currentTest: fakeCurrentTest,
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
        const cb = [...args].pop() as Func;
        cb.call(fakeContext, () => {});
        return {} as Hook;
    };
    const defaultBaseTest = (_title: string, cb: Func) => {
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

    const defaultMethods: MochaMethods = {
        suite: defaultSuite,
        before: defaultHook,
        beforeEach: defaultHook,
        test: defaultTest,
        afterEach: defaultHook,
        after: defaultHook,
    };

    suite('Test failure', () => {
        mocha.test('Test with done returns truthy', done => {
            const stubDone = stub();
            const fakeBaseTest = (_title: string, cb: Func) => {
                cb.call(fakeContext, stubDone as Done);
            };

            stubDone.withArgs().returns(null);
            stubDone.withArgs(match.string).callsFake(arg => {
                expect(arg).to.equal('Test returned truthy value: true');
                done();
            });

            const fakeTest = createMochaChain({
                ...defaultMethods,
                test: Object.assign(fakeBaseTest, {
                    skip: fakeBaseTest,
                    only: fakeBaseTest,
                }) as TestFunction,
            }).test;

            fakeTest('Will return true', (doneCb): false => {
                doneCb();

                return true as false;
            });
        });

        mocha.test('Test with done throws an error', done => {
            const mockDone = mock();
            const fakeBaseTest = (_title: string, cb: Func) => {
                cb.call(fakeContext, mockDone as Done);
            };

            mockDone.withArgs(match(err => err instanceof Error)).callsFake(arg => {
                expect(arg).to.be.an.instanceOf(Error).that.contains({
                    message: '<ERROR>',
                });
                done();
            });

            const fakeTest = createMochaChain({
                ...defaultMethods,
                test: Object.assign(fakeBaseTest, {
                    skip: fakeBaseTest,
                    only: fakeBaseTest,
                }) as TestFunction,
            }).test;

            fakeTest('Will return true', doneCb => {
                if (Math.random()) {
                    throw new Error('<ERROR>');
                }
                doneCb();
            });
        });

        test('Test declared inside a test', () => {
            // Only declared to check that it throws
            // eslint-disable-next-line sonarjs/assertions-in-tests
            expect(() => test('This will never run', () => {}))
                .to.throw(Error)
                .that.contains({
                    message: 'Cannot create new hook/suite/test while executing a hook/test',
                });
        });
    });

    suite('Hooks failure', () => {
        mocha.test('One-time hook with done throws an error', done => {
            const mockDone = mock();
            const fakeHook = (cb: Func) => {
                cb.call(fakeContext, mockDone as Done);
                return {} as Hook;
            };

            mockDone.withArgs(match(err => err instanceof Error)).callsFake(arg => {
                expect(arg).to.be.an.instanceOf(Error).that.contains({
                    message: '<ERROR>',
                });
                done();
            });

            const customBefore = createMochaChain({
                ...defaultMethods,
                before: fakeHook as HookFunction<Hook>,
            }).before;

            customBefore(doneCb => {
                if (Math.random()) {
                    throw new Error('<ERROR>');
                }
                doneCb();
            });
        });

        mocha.test('Per-test hook with done throws an error', done => {
            const mockDone = mock();
            const fakeHook = (cb: Func) => {
                cb.call(fakeContext, mockDone as Done);
            };

            mockDone.withArgs(match(err => err instanceof Error)).callsFake(arg => {
                expect(arg).to.be.an.instanceOf(Error).that.contains({
                    message: '<ERROR>',
                });
                done();
            });

            const customBeforeEach = createMochaChain({
                ...defaultMethods,
                beforeEach: fakeHook as HookFunction<Hook>,
            }).beforeEach;

            customBeforeEach(doneCb => {
                if (Math.random()) {
                    throw new Error('<ERROR>');
                }
                doneCb();
            });
        });

        after('Test declared inside a hook', () => {
            // Only declared to check that it throws
            // eslint-disable-next-line sonarjs/assertions-in-tests
            expect(() => test('This will never run', () => {})).to.throw(
                Error,
                'Cannot create new hook/suite/test while executing a hook/test'
            );
        });
    });

    suite('Recorded hooks', () => {
        type Recorded = (this: MochaContext) => Promise<void>;

        /**
         * Fake mocha methods that record callbacks, so tests can control execution order.
         *
         * @returns recorded callbacks and chain built on fake methods
         */
        const createRecordingChain = () => {
            const registered = {
                before: [] as Recorded[],
                beforeEach: [] as Recorded[],
                afterEach: [] as Recorded[],
                after: [] as Recorded[],
            };
            const record = (name: keyof typeof registered) =>
                ((cb: Recorded) => {
                    registered[name].push(cb);
                }) as HookFunction<Hook>;
            const chain = createMochaChain({
                ...defaultMethods,
                before: record('before'),
                beforeEach: record('beforeEach'),
                afterEach: record('afterEach'),
                after: record('after'),
            });
            return { registered, chain };
        };

        suite('Hooks executed out of order', () => {
            const message = 'Chained hook executed before the hook it is chained from';

            mocha.test('afterEach', async () => {
                const { registered, chain } = createRecordingChain();
                chain.afterEach(() => ({ abc: 123 })).afterEach(() => {});

                const [first, second] = registered.afterEach;

                const thrown: unknown = await expect(second!.call(fakeContext)).to.be.rejected;
                expect(thrown).to.have.property('message').that.includes(message);
                await first!.call(fakeContext);
            });

            mocha.test('after', async () => {
                const { registered, chain } = createRecordingChain();
                chain.after(() => ({ abc: 123 })).after(() => {});

                const [first, second] = registered.after;

                const thrown: unknown = await expect(second!.call(fakeContext)).to.be.rejected;
                expect(thrown).to.have.property('message').that.includes(message);
                await first!.call(fakeContext);
            });
        });

        suite('Failed hooks still propagate existing context', () => {
            mocha.test('beforeEach', async () => {
                const { registered, chain } = createRecordingChain();
                let teardownContext: object | null = null;
                chain
                    .beforeEach(() => ({ abc: 123 }))
                    .beforeEach(() => {
                        throw new Error('<ERROR>');
                    })
                    .afterEach(ctx => {
                        teardownContext = ctx;
                    });

                const [first, second] = registered.beforeEach;
                await first!.call(fakeContext);
                const thrown: unknown = await expect(second!.call(fakeContext)).to.be.rejected;
                expect(thrown).to.have.property('message').that.includes('<ERROR>');
                await registered.afterEach[0]!.call(fakeContext);

                expect(teardownContext).to.deep.equal({ abc: 123 });
            });

            mocha.test('before', async () => {
                const { registered, chain } = createRecordingChain();
                let teardownContext: object | null = null;
                chain
                    .before(() => ({ abc: 123 }))
                    .before(() => {
                        throw new Error('<ERROR>');
                    })
                    .after(ctx => {
                        teardownContext = ctx;
                    });

                const [first, second] = registered.before;
                await first!.call(fakeContext);
                const thrown: unknown = await expect(second!.call(fakeContext)).to.be.rejected;
                expect(thrown).to.have.property('message').that.includes('<ERROR>');
                await registered.after[0]!.call(fakeContext);

                expect(teardownContext).to.deep.equal({ abc: 123 });
            });
        });
    });

    afterEach(() => {
        verifyAndRestore();
    });
});

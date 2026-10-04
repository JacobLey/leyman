import type * as vitest from 'vitest';
import type { VitestMethods } from '#internal/lib/vitest-chain.js';
import { describe, expect, test } from 'vitest';
import { createVitestChain } from '#internal/lib/vitest-chain.js';

type Registered = (...args: unknown[]) => Promise<void>;

/**
 * Fake vitest methods that record callbacks, so tests can control execution order.
 *
 * @returns recorded callbacks and fake methods
 */
const createFakeVitest = () => {
    const registered = {
        beforeAll: [] as Registered[],
        beforeEach: [] as Registered[],
        test: [] as Registered[],
        afterEach: [] as Registered[],
        afterAll: [] as Registered[],
    };
    const hook = (name: keyof typeof registered) => (fn: () => Promise<void>) => {
        registered[name].push(fn as Registered);
    };
    const fakeTest = (_name: string, fn: () => Promise<void>) => {
        registered.test.push(fn as Registered);
    };
    const fakeDescribe = (_name: string, fn: () => Promise<void> | void) => {
        void fn();
    };
    const methods: VitestMethods = {
        describe: Object.assign(fakeDescribe, { only: fakeDescribe, skip: fakeDescribe }),
        beforeAll: hook('beforeAll'),
        beforeEach: hook('beforeEach'),
        test: Object.assign(fakeTest, { only: fakeTest, skip: fakeTest }),
        afterEach: hook('afterEach'),
        afterAll: hook('afterAll'),
    };
    return { registered, chain: createVitestChain(methods) };
};

const fakeTestContext = (): vitest.TestContext =>
    ({ task: { name: '<test>' } }) as unknown as vitest.TestContext;

describe('Failure cases', () => {
    describe('Hooks executed out of order', () => {
        const message = 'Chained hook executed before the hook it is chained from';

        test('afterEach', async () => {
            const { registered, chain } = createFakeVitest();
            chain.afterEach(() => ({ abc: 123 })).afterEach(() => {});

            const [first, second] = registered.afterEach;

            // Vitest's default `stack` sequence runs afterEach hooks in reverse
            await expect(second!(fakeTestContext())).rejects.toThrow(message);
            await first!(fakeTestContext());
        });

        test('afterAll', async () => {
            const { registered, chain } = createFakeVitest();
            chain.afterAll(() => ({ abc: 123 })).afterAll(() => {});

            const [first, second] = registered.afterAll;

            await expect(second!({})).rejects.toThrow(message);
            await first!({});
        });
    });

    describe('Failed hooks still propagate existing context', () => {
        test('beforeEach', async () => {
            const { registered, chain } = createFakeVitest();
            let teardownContext: object | null = null;
            chain
                .beforeEach(() => ({ abc: 123 }))
                .beforeEach(() => {
                    throw new Error('<ERROR>');
                })
                .afterEach(ctx => {
                    teardownContext = ctx;
                });

            const testContext = fakeTestContext();
            const [first, second] = registered.beforeEach;
            await first!(testContext);
            await expect(second!(testContext)).rejects.toThrow('<ERROR>');
            await registered.afterEach[0]!(testContext);

            expect(teardownContext).toEqual({ abc: 123 });
        });

        test('beforeAll', async () => {
            const { registered, chain } = createFakeVitest();
            let teardownContext: object | null = null;
            chain
                .beforeAll(() => ({ abc: 123 }))
                .beforeAll(() => {
                    throw new Error('<ERROR>');
                })
                .afterAll(ctx => {
                    teardownContext = ctx;
                });

            const [first, second] = registered.beforeAll;
            await first!({});
            await expect(second!({})).rejects.toThrow('<ERROR>');
            await registered.afterAll[0]!({});

            expect(teardownContext).toEqual({ abc: 123 });
        });
    });
});

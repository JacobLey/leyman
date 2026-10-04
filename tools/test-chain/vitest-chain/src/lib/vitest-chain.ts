import type * as vitest from 'vitest';
import type {
    ContextualDescribe,
    EntrypointAfterAllHook,
    EntrypointAfterEachHook,
    EntrypointBeforeAllHook,
    EntrypointBeforeEachHook,
    EntrypointTest,
} from './types.js';
import { createChain } from 'test-chain-core';

type VitestHook = (fn: () => Promise<void>) => void;
type VitestTest = (name: string, fn: () => Promise<void>) => void;
type VitestDescribe = (name: string, fn: () => Promise<void> | void) => void;

export interface VitestMethods {
    describe: VitestDescribe & { only: VitestDescribe; skip: VitestDescribe };
    beforeAll: VitestHook;
    beforeEach: VitestHook;
    test: VitestTest & { only: VitestTest; skip: VitestTest };
    afterEach: VitestHook;
    afterAll: VitestHook;
}

export interface VitestChain {
    describe: ContextualDescribe;
    beforeAll: EntrypointBeforeAllHook;
    beforeEach: EntrypointBeforeEachHook;
    test: EntrypointTest;
    afterEach: EntrypointAfterEachHook;
    afterAll: EntrypointAfterAllHook;
}

/**
 * Vitest passes the test context as the first argument to per-test hooks and tests.
 *
 * @param _thisArg - unused
 * @param args - arguments passed by vitest
 * @returns currently executing test
 */
const getTask = (_thisArg: unknown, [context]: unknown[]): vitest.TestContext['task'] =>
    (context as vitest.TestContext).task;

/**
 * Build vitest-chain methods on top of the provided vitest methods.
 *
 * @param methods - Vitest's native methods
 * @returns chain-able methods
 */
export const createVitestChain = (methods: VitestMethods): VitestChain => {
    const chain = createChain({
        methods: {
            suite: methods.describe,
            before: methods.beforeAll,
            beforeEach: methods.beforeEach,
            test: methods.test,
            afterEach: methods.afterEach,
            after: methods.afterAll,
        },
        currentTest: {
            inHook: getTask,
            inTest: getTask,
        },
        supportsDone: false,
        allowAsyncSuites: true,
        names: {
            before: ['beforeAll'],
            beforeEach: ['beforeEach'],
            test: ['it', 'test'],
            skipTest: [],
            afterEach: ['afterEach'],
            after: ['afterAll'],
        },
    });

    return {
        describe: chain.suite,
        beforeAll: chain.before as unknown as EntrypointBeforeAllHook,
        beforeEach: chain.beforeEach as unknown as EntrypointBeforeEachHook,
        test: chain.test,
        afterEach: chain.afterEach as unknown as EntrypointAfterEachHook,
        afterAll: chain.after as unknown as EntrypointAfterAllHook,
    };
};

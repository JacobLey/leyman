import type {
    Hook,
    HookFunction,
    Context as MochaContext,
    Test as MochaTest,
    SuiteFunction,
    TestFunction,
} from 'mocha';
import type {
    ContextualSuite,
    EntrypointAfterEachHook,
    EntrypointAfterHook,
    EntrypointBeforeEachHook,
    EntrypointBeforeHook,
    EntrypointTest,
} from './types.js';
import { createChain } from 'test-chain-core';

export interface MochaMethods {
    suite: SuiteFunction;
    before: HookFunction | HookFunction<Hook>;
    beforeEach: HookFunction | HookFunction<Hook>;
    test: TestFunction;
    afterEach: HookFunction | HookFunction<Hook>;
    after: HookFunction | HookFunction<Hook>;
}

export interface MochaChain {
    suite: ContextualSuite;
    before: EntrypointBeforeHook;
    beforeEach: EntrypointBeforeEachHook;
    test: EntrypointTest;
    afterEach: EntrypointAfterEachHook;
    after: EntrypointAfterHook;
}

/**
 * Build mocha-chain methods on top of the provided mocha methods.
 *
 * @param methods - Mocha's native BDD/TDD methods
 * @returns chain-able methods
 */
export const createMochaChain = (methods: MochaMethods): MochaChain =>
    createChain<MochaTest>({
        methods,
        currentTest: {
            inHook: thisArg => (thisArg as MochaContext).currentTest!,
            inTest: thisArg => (thisArg as MochaContext).test as MochaTest,
        },
        supportsDone: true,
        allowAsyncSuites: false,
        names: {
            before: ['before', 'suiteSetup'],
            beforeEach: ['beforeEach', 'setup'],
            test: ['it', 'specify', 'test'],
            skipTest: ['xit'],
            afterEach: ['afterEach', 'teardown'],
            after: ['after', 'suiteTeardown'],
        },
    }) as unknown as MochaChain;

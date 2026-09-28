import type { ChainFramework, ChainSuite } from './framework.js';
import type {
    ContextMap,
    HookArgs,
    OneTimeContext,
    TestRegistrar,
    UserCallback,
} from './wrappers.js';
import { checkLock, createSuite, toHookRegistrar, toTestRegistrar } from './framework.js';
import { withoutContext, wrapOneTimeHook, wrapPerTestHook, wrapTest } from './wrappers.js';

/**
 * Object of chained hooks/tests, keyed by the framework-specific names in `ChainNames`.
 */
export type Chain = Record<string, unknown>;

export type ChainHook = (...args: HookArgs) => Chain;

type TestFn = (title: string, cb: UserCallback) => unknown;
export interface ChainTest extends TestFn {
    only: TestFn;
    skip: TestFn;
}

export interface ChainEntrypoints {
    suite: ChainSuite;
    before: ChainHook;
    beforeEach: ChainHook;
    test: ChainTest;
    afterEach: ChainHook;
    after: ChainHook;
}

const toChain = (entries: [aliases: readonly string[], value: unknown][]): Chain => {
    const chain: Chain = {};
    for (const [aliases, value] of entries) {
        for (const alias of aliases) {
            chain[alias] = value;
        }
    }
    return chain;
};

const entrypointHook =
    (contextualHook: ChainHook): ChainHook =>
    (...args) =>
        args.length === 1
            ? contextualHook(withoutContext(args[0]))
            : contextualHook(args[0], withoutContext(args[1]));

const entrypointTest =
    (contextualTest: TestFn): TestFn =>
    (title, cb) =>
        contextualTest(title, withoutContext(cb));

/**
 * Implement context propagation, to create chain-able hooks.
 *
 * Each hook registers itself with the framework and returns an object of hooks/tests
 * that will receive the context it generates.
 *
 * Entrypoint (top level) hooks/tests do not receive a context, as it would always be empty.
 *
 * Returned values are loosely typed. Frameworks are expected to expose their own precise types.
 *
 * @template Key - identity of a test
 * @param framework - description of the test framework
 * @returns entrypoint hooks/tests
 */
export const createChain = <Key extends object>(
    framework: ChainFramework<Key>
): ChainEntrypoints => {
    const { methods, names } = framework;
    const before = toHookRegistrar(framework, methods.before);
    const beforeEach = toHookRegistrar(framework, methods.beforeEach);
    const test = toTestRegistrar(framework, methods.test);
    const testOnly = toTestRegistrar(framework, methods.test.only);
    const testSkip = toTestRegistrar(framework, methods.test.skip);
    const afterEach = toHookRegistrar(framework, methods.afterEach);
    const after = toHookRegistrar(framework, methods.after);

    const contextualTest = (map: ContextMap<Key>): ChainTest => {
        const withRegistrar =
            (registrar: TestRegistrar<Key>): TestFn =>
            (title, cb) =>
                wrapTest(checkLock, registrar, map, title, cb);
        return Object.assign(withRegistrar(test), {
            only: withRegistrar(testOnly),
            skip: withRegistrar(testSkip),
        });
    };

    const contextualAfterEach =
        (map: ContextMap<Key>): ChainHook =>
        (...args) => {
            const merged = wrapPerTestHook(checkLock, afterEach, map, args);
            return toChain([[names.afterEach, contextualAfterEach(merged)]]);
        };

    const contextualAfter =
        (ctx: OneTimeContext): ChainHook =>
        (...args) => {
            const merged = wrapOneTimeHook(checkLock, after, ctx, args);
            return toChain([[names.after, contextualAfter(merged)]]);
        };

    const contextualBeforeEach =
        (map: ContextMap<Key>): ChainHook =>
        (...args) => {
            const merged = wrapPerTestHook(checkLock, beforeEach, map, args);
            const tests = contextualTest(merged);
            return toChain([
                [names.beforeEach, contextualBeforeEach(merged)],
                [names.test, tests],
                [names.skipTest, tests.skip],
                [names.afterEach, contextualAfterEach(merged)],
            ]);
        };

    const contextualBefore =
        (ctx: OneTimeContext): ChainHook =>
        (...args) => {
            const merged = wrapOneTimeHook(checkLock, before, ctx, args);
            // Every test sees the same context from a one-time hook.
            const sameForEveryTest: ContextMap<Key> = {
                get: async () => merged.context,
            };
            const tests = contextualTest(sameForEveryTest);
            return toChain([
                [names.before, contextualBefore(merged)],
                [names.beforeEach, contextualBeforeEach(sameForEveryTest)],
                [names.test, tests],
                [names.skipTest, tests.skip],
                [names.afterEach, contextualAfterEach(sameForEveryTest)],
                [names.after, contextualAfter(merged)],
            ]);
        };

    const emptyContext: OneTimeContext = {
        started: true,
        context: Promise.resolve({}),
    };
    const emptyMap: ContextMap<Key> = {
        get: async () => ({}),
    };
    const tests = contextualTest(emptyMap);

    return {
        suite: createSuite(framework),
        before: entrypointHook(contextualBefore(emptyContext)),
        beforeEach: entrypointHook(contextualBeforeEach(emptyMap)),
        test: Object.assign(entrypointTest(tests), {
            only: entrypointTest(tests.only),
            skip: entrypointTest(tests.skip),
        }),
        afterEach: entrypointHook(contextualAfterEach(emptyMap)),
        after: entrypointHook(contextualAfter(emptyContext)),
    };
};

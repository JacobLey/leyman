import type { Handler, HookRegistrar, TestRegistrar, UserCallback } from './wrappers.js';

/**
 * A native test framework method (e.g. Mocha's `before`, Vitest's `test`).
 *
 * Left opaque, as frameworks declare these with many overloads.
 */

export type NativeMethod = (this: any, ...args: any[]) => unknown;

export interface NativeMethodWithModifiers extends NativeMethod {
    only: NativeMethod;
    skip: NativeMethod;
}

/**
 * The native methods of a test framework, that chained methods are built on.
 */
export interface NativeMethods {
    suite: NativeMethodWithModifiers;
    before: NativeMethod;
    beforeEach: NativeMethod;
    test: NativeMethodWithModifiers;
    afterEach: NativeMethod;
    after: NativeMethod;
}

/**
 * Property names that chained hooks are exposed under.
 *
 * Frameworks use different names (and aliases) for the same concepts, e.g. Mocha's `before`/`suiteSetup`
 * vs Vitest's `beforeAll`.
 */
export interface ChainNames {
    before: readonly string[];
    beforeEach: readonly string[];
    test: readonly string[];
    /**
     * Aliases for `test.skip`, e.g. Mocha's `xit`.
     */
    skipTest: readonly string[];
    afterEach: readonly string[];
    after: readonly string[];
}

/**
 * Description of a test framework, that the core chaining logic is built on.
 *
 * @template Key - identity of a test
 */
export interface ChainFramework<Key extends object> {
    methods: NativeMethods;
    /**
     * Identify the currently executing test, given the `this` binding and arguments
     * the framework passed to a native callback.
     */
    currentTest: {
        inHook: (thisArg: unknown, args: unknown[]) => Key;
        inTest: (thisArg: unknown, args: unknown[]) => Key;
    };
    /**
     * Whether callbacks that declare an extra parameter receive a `done` callback (e.g. Mocha).
     */
    supportsDone: boolean;
    names: ChainNames;
}

/**
 * Number of hooks/tests currently executing.
 *
 * Hooks/tests/suites declared while one is executing are either silently ignored
 * or rejected by the framework, so reject them up front.
 */
let executing = 0;

export const checkLock = (): void => {
    if (executing > 0) {
        throw new Error('Cannot create new hook/suite/test while executing a hook/test');
    }
};

type Done = (err?: unknown) => void;

/**
 * Convert the core handler into a native framework callback.
 *
 * `done`-style callbacks are detected by arity (consistent with Mocha). Failures must then be reported
 * via `done` rather than a rejected promise, and tests returning a truthy value are a failure.
 *
 * Otherwise the callback declares no parameters, and forwards `arguments` to the user's callback.
 * Some frameworks (e.g. Vitest) parse callback source to detect fixture usage, and reject parameters
 * that are not object destructuring patterns. Declaring none opts out of that detection.
 *
 * The callback never resolves a value, so frameworks (e.g. Vitest) never mistake context
 * returned by a hook for a cleanup function.
 *
 * @template Key - identity of a test
 * @param framework - framework description
 * @param cb - callback provided by user
 * @param getKey - identify the currently executing test
 * @param handler - core hook/test logic
 * @param isTest - whether callback is for a test (rather than a hook)
 * @returns callback to register with the framework
 */
const toNativeCallback = <Key extends object>(
    framework: ChainFramework<Key>,
    cb: UserCallback,
    getKey: (thisArg: unknown, args: unknown[]) => Key,
    handler: Handler<Key>,
    isTest: boolean
): NativeMethod => {
    if (framework.supportsDone && cb.length > 1) {
        return function (this: unknown, done: Done): void {
            ++executing;
            let finished = false;
            const finish: Done = err => {
                if (!finished) {
                    finished = true;
                    --executing;
                }

                done(err);
            };
            void handler({
                key: getKey(this, [done]),
                call: ctx => {
                    const result: unknown = cb.call(this, ctx, finish);
                    if (isTest && result) {
                        finish(`Test returned truthy value: ${JSON.stringify(result)}`);
                    }
                    return result;
                },
            }).catch(finish);
        };
    }

    return async function (this: unknown): Promise<void> {
        // eslint-disable-next-line prefer-rest-params, sonarjs/arguments-usage
        const args: unknown[] = [...arguments];
        ++executing;
        try {
            await handler({
                key: getKey(this, args),
                call: async ctx => cb.call(this, ctx, ...args),
            });
        } finally {
            --executing;
        }
    };
};

export const toHookRegistrar =
    <Key extends object>(framework: ChainFramework<Key>, hook: NativeMethod): HookRegistrar<Key> =>
    (title, cb, handler) => {
        const nativeCb = toNativeCallback(
            framework,
            cb,
            framework.currentTest.inHook,
            handler,
            false
        );
        return title === undefined ? hook(nativeCb) : hook(title, nativeCb);
    };

export const toTestRegistrar =
    <Key extends object>(framework: ChainFramework<Key>, test: NativeMethod): TestRegistrar<Key> =>
    (title, cb, handler) =>
        test(title, toNativeCallback(framework, cb, framework.currentTest.inTest, handler, true));

type SuiteFn = (title: string, cb: UserCallback) => unknown;
export interface ChainSuite extends SuiteFn {
    only: SuiteFn;
    skip: SuiteFn;
}

const withSuiteLock =
    (suite: NativeMethod): SuiteFn =>
    (title, cb) => {
        checkLock();
        return suite(title, function (this: unknown): void {
            if (cb.call(this) instanceof Promise) {
                throw new TypeError('Suite callback must be synchronous');
            }
        });
    };

/**
 * Wrap the native suite method with enforcement that it is never called:
 * - Inside a hook/test
 * - With an async callback
 *   - e.g. Mocha does not respect async suites, and carries on leading to race conditions.
 *
 * @template Key - identity of a test
 * @param framework - framework description
 * @returns wrapped suite method
 */
export const createSuite = <Key extends object>({ methods }: ChainFramework<Key>): ChainSuite =>
    Object.assign(withSuiteLock(methods.suite), {
        only: withSuiteLock(methods.suite.only),
        skip: withSuiteLock(methods.suite.skip),
    });

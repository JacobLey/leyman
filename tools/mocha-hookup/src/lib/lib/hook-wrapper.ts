import {
    Context as MochaContext,
    Done,
    HookFunction,
    Test as MochaTest,
} from 'mocha';
import pDefer from 'p-defer';
import {
    type AllowableAdditionalContext,
    type MergeContext,
    mergeContexts,
} from './merge-context.js';
import { acquireLock, checkLock } from './execution-lock.js';

/**
 * Before/After hooks run only once in the lifecycle of tests.
 *
 * Therefore the incoming context must be a single promise, and it will emit a single promise.
 *
 * The invocation of the hook cb will be wrapped by promise that will load the incoming context,
 * and pass it to the actual cb.
 *
 * The context returned by the hook will be resolved into the deferred promise that is returned on initial call.
 */
export const wrapOneTimeHookWithContext = <
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
>(
    /**
     * Mocha's before/after hook
     */
    hook: HookFunction,
    /**
     * Incoming promise of context.
     */
    existing: Promise<ExistingContext>,
    /**
     * Agruments passed to hook.
     * Either is plain hook, or prepended with a title.
     */
    args:
        | [
              (
                  this: MochaContext,
                  ctx: ExistingContext,
                  done: Done
              ) => AdditionalContext,
          ]
        | [
              string,
              (
                  this: MochaContext,
                  ctx: ExistingContext,
                  done: Done
              ) => AdditionalContext,
          ]
): Promise<MergeContext<ExistingContext, Awaited<AdditionalContext>>> => {
    checkLock();

    const cb = args.length === 1 ? args[0] : args[1];

    const deferred = pDefer<AdditionalContext>();

    const doneCb = function (this: MochaContext, done: Done) {
        acquireLock(this.runnable());
        void Promise.resolve().then(async () => {
            try {
                const additional = await cb.call(
                    this,
                    { ...(await existing) },
                    done
                );
                deferred.resolve(additional);
            } catch (err) {
                done(err);
            }
        });
    };

    const asyncCb = async function (this: MochaContext) {
        acquireLock(this.runnable());
        const additional = await cb.apply(this, [
            { ...(await existing) },
        ] as unknown as [ExistingContext, Done]);
        deferred.resolve(additional);
    };

    const wrappedCb = cb.length > 1 ? doneCb : asyncCb;

    if (typeof args[0] === 'string') {
        hook(args[0], wrappedCb);
    } else {
        hook(wrappedCb);
    }

    return mergeContexts(existing, deferred.promise);
};

/**
 * BeforeEach/AfterEach hooks runs for each test context.
 *
 * Therefore the incoming context mapped by test context, and will similarly emit context in a map.
 *
 * The invocation of the hook cb will be wrapped by promise that will load the incoming context,
 * and pass it to the actual cb.
 *
 * The context returned by the hook will be resolved into the deferred promise that is returned on initial call.
 */
export const wrapPerTestHookWithContext = <
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
>(
    /**
     * Mocha's beforeEach/afterEach hook
     */
    hook: HookFunction,
    /**
     * Incoming promise of context, mapped by Test.
     *
     * While implemention is recommended to be a WeakMap, technically it can be anything that implements `get`.
     * This is useful for cases like entrypoint and one-time mapping, which will return the same value regardless
     * of what "key" is provided
     */
    existingMap: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>,
    /**
     * Agruments passed to hook.
     * Either is plain hook, or prepended with a title.
     */
    args:
        | [
              (
                  this: MochaContext,
                  ctx: ExistingContext,
                  done: Done
              ) => AdditionalContext,
          ]
        | [
              string,
              (
                  this: MochaContext,
                  ctx: ExistingContext,
                  done: Done
              ) => AdditionalContext,
          ]
): WeakMap<
    MochaTest,
    Promise<MergeContext<ExistingContext, Awaited<AdditionalContext>>>
> => {
    checkLock();

    const cb = args.length === 1 ? args[0] : args[1];

    // Initial map is not populated.
    // A new map is initiated per call to beforeEach/afterEach.
    // Map will always be populated for downstream consumers because it is either:
    // 1) Written with a deferred promise before invoking cb
    // 2) Writes after cb is invoked, but before test is complete
    const testToPromise = new WeakMap<
        MochaTest,
        Promise<MergeContext<ExistingContext, Awaited<AdditionalContext>>>
    >();

    const doneCb = function (this: MochaContext, done: Done) {
        acquireLock(this.runnable());
        void Promise.resolve().then(async () => {
            try {
                const existing = await existingMap.get(this.currentTest!)!;
                const deferred =
                    pDefer<
                        MergeContext<
                            ExistingContext,
                            Awaited<AdditionalContext>
                        >
                    >();
                testToPromise.set(this.currentTest!, deferred.promise);
                const additional = await cb.call(this, { ...existing }, done);
                deferred.resolve(await mergeContexts(existing, additional));
            } catch (err) {
                done(err);
            }
        });
    };

    const asyncCb = async function (this: MochaContext) {
        acquireLock(this.runnable());
        const existing = await existingMap.get(this.currentTest!)!;
        const additional = await cb.apply(this, [
            { ...existing },
        ] as unknown as [ExistingContext, Done]);
        testToPromise.set(
            this.currentTest!,
            mergeContexts(existing, additional)
        );
    };

    const wrappedCb = cb.length > 1 ? doneCb : asyncCb;

    if (typeof args[0] === 'string') {
        hook(args[0], wrappedCb);
    } else {
        hook(wrappedCb);
    }

    return testToPromise;
};

export interface GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: object, done: Done) => AdditionalContext
    ): object;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: object, done: Done) => AdditionalContext
    ): object;
}

/**
 * Hooks that are used as the "entrypoint" (not propagating any context)
 * should not provide the context as a parameter to the callback (for simplicity).
 *
 * Wrap the callback in another that strips out the context.
 */
export const wrapHookWithEntrypoint = <
    ContextualHook extends GenericContextualHook,
>(
    /**
     * Hook that contains "propagated" empty context.
     */
    contextualHook: ContextualHook
): ((
    ...args:
        | [(this: MochaContext, done: Done) => AllowableAdditionalContext]
        | [
              string,
              (this: MochaContext, done: Done) => AllowableAdditionalContext,
          ]
) => object) => {
    return (...args) => {
        const cb = args.length === 1 ? args[0] : args[1];
        if (typeof args[0] === 'string') {
            if (cb.length > 0) {
                return contextualHook(args[0], function (ignore, done) {
                    return cb.call(this, done);
                });
            }
            return contextualHook(args[0], function (this: MochaContext) {
                return cb.apply(this, [] as unknown as [Done]);
            });
        }

        if (cb.length > 0) {
            return contextualHook(function (ignore, done) {
                return cb.call(this, done);
            });
        }
        return contextualHook(function (this: MochaContext) {
            return cb.apply(this, [] as unknown as [Done]);
        });
    };
};

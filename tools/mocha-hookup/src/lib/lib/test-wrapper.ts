import type {
    Context as MochaContext,
    Done,
    Test as MochaTest,
    ExclusiveTestFunction,
} from 'mocha';
import { acquireLock, checkLock } from './execution-lock.js';

export type ValidDoneReturnTypes =
    | undefined
    | null
    | 0
    | 0n
    | false
    | ''
    | void;

/**
 * Tests will load the context from the map, and pass that onto the provided test callback.
 *
 * The response from the test is ignored, except in the case of tests using `done`, in which case
 * truthy values will trigger a failure (consistent with Mocha).
 *
 * This method returns the actual `Test` object returned by mocha.
 */
export const wrapTestWithContext = <ExistingContext extends object>(
    test: ExclusiveTestFunction,
    existingMap: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>,
    title: string,
    cb: (this: MochaContext, ctx: ExistingContext, done: Done) => void
): MochaTest => {
    checkLock();

    const doneCb = function (this: MochaContext, done: Done) {
        acquireLock(this.runnable());
        void Promise.resolve().then(async () => {
            try {
                const existing = await existingMap.get(this.test as MochaTest)!;
                const result: unknown = cb.call(this, { ...existing }, done);
                if (result) {
                    done(`Test returned truthy value: ${result}`);
                }
            } catch (err) {
                done(err);
            }
        });
    };

    const asyncCb = async function (this: MochaContext) {
        acquireLock(this.runnable());
        const existing = await existingMap.get(this.test as MochaTest)!;
        await cb.apply(this, [existing] as unknown as [ExistingContext, Done]);
    };

    const wrappedCb = cb.length > 1 ? doneCb : asyncCb;

    return test(title, wrappedCb);
};

export interface GenericContextualTest {
    (
        name: string,
        fn: (
            this: MochaContext,
            ctx: object,
            done: Done
        ) => ValidDoneReturnTypes
    ): MochaTest;
    (name: string, fn: (this: MochaContext, ctx: object) => void): MochaTest;
}

export interface ExclusiveEntrypointTest {
    (
        name: string,
        fn: (this: MochaContext, done: Done) => ValidDoneReturnTypes
    ): MochaTest;
    (name: string, fn: (this: MochaContext) => void): MochaTest;
}

/**
 * Tests that are executed from the "entrypoint" (not depending on any propagated context)
 * should not provide this empty context to callers for simplicity.
 *
 * Wrap the test with another callback that will strip out the ignored context.
 */
export const wrapTestWithEntrypoint = (
    contextualTest: GenericContextualTest
): ExclusiveEntrypointTest => {
    return (title, cb): MochaTest => {
        if (cb.length === 0) {
            return contextualTest(title, function (this: MochaContext) {
                return (cb as (this: MochaContext) => void).apply(this);
            });
        }
        return contextualTest(title, function (ignore, done) {
            return (
                cb as (this: MochaContext, done: Done) => ValidDoneReturnTypes
            ).call(this, done);
        });
    };
};

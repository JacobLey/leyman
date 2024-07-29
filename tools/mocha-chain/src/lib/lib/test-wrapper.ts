import type {
    Done,
    ExclusiveTestFunction,
    Context as MochaContext,
    Test as MochaTest,
} from 'mocha';
import { acquireLock, checkLock } from './execution-lock.js';

export type ValidDoneReturnTypes = '' | 0 | 0n | false | null | undefined | void;

/**
 * Tests will load the context from the map, and pass that onto the provided test callback.
 *
 * The response from the test is ignored, except in the case of tests using `done`, in which case
 * truthy values will trigger a failure (consistent with Mocha).
 *
 * This method returns the actual `Test` object returned by mocha.
 *
 * @param test - Test function exposed by mocha
 * @param existingMap - Map Getter of test instance to promise of context
 * @param title - Name of test
 * @param cb - test callback provided by tester
 * @returns test context returned by mocha
 */
export const wrapTestWithContext = <ExistingContext extends object>(
    test: ExclusiveTestFunction,
    existingMap: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>,
    title: string,
    cb: (this: MochaContext, ctx: ExistingContext, done: Done) => Promise<void> | void
): MochaTest => {
    checkLock();

    const doneCb = function (this: MochaContext, done: Done): void {
        acquireLock(this.runnable());
        void Promise.resolve().then(async (): Promise<void> => {
            try {
                const existing = await existingMap.get(this.test as MochaTest)!;
                const result: unknown = cb.call(this, { ...existing }, done);
                if (result) {
                    // eslint-disable-next-line n/callback-return
                    done(`Test returned truthy value: ${JSON.stringify(result)}`);
                }
            } catch (err) {
                // eslint-disable-next-line n/callback-return
                done(err);
            }
        });
    };

    const asyncCb = async function (this: MochaContext): Promise<void> {
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
        fn: (this: MochaContext, ctx: object, done: Done) => ValidDoneReturnTypes
    ): MochaTest;
    (name: string, fn: (this: MochaContext, ctx: object) => Promise<void> | void): MochaTest;
}

export interface ExclusiveEntrypointTest {
    (name: string, fn: (this: MochaContext, done: Done) => ValidDoneReturnTypes): MochaTest;
    (name: string, fn: (this: MochaContext) => void): MochaTest;
}

/**
 * Tests that are executed from the "entrypoint" (not depending on any propagated context)
 * should not provide this empty context to callers for simplicity.
 *
 * Wrap the test with another callback that will strip out the ignored context.
 *
 * @param contextualTest - test function built by mocha-chain that passes context to test
 * @returns test function that no longer passes a context (because it would always be empty)
 */
export const wrapTestWithEntrypoint =
    (contextualTest: GenericContextualTest): ExclusiveEntrypointTest =>
    (title, cb): MochaTest => {
        if (cb.length === 0) {
            return contextualTest(title, async function (this: MochaContext) {
                await (cb as (this: MochaContext) => Promise<void>).apply(this);
            });
        }
        return contextualTest(title, function (this, ignore, done) {
            return (cb as (this: MochaContext, done: Done) => ValidDoneReturnTypes).call(
                this,
                done
            );
        });
    };

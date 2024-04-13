import type { ExclusiveSuiteFunction, Suite as MochaSuite } from 'mocha';
import { bind, createModule, identifier, singletonScope } from 'haywire';
import { suiteIdentifier } from '#mocha-module';
import { checkLock } from './lib/execution-lock.js';

declare const invalidInput: unique symbol;
interface InvalidInput<Title extends string> {
    name: string;
    [invalidInput]: Title;
}

export interface ExclusiveContextualSuite {
    (
        title: string,
        fn: (this: MochaSuite) => Promise<unknown>,
        illegalArgs: InvalidInput<'NoAsyncSuite'>
    ): MochaSuite;
    (
        title: string,
        fn: (this: MochaSuite) => null | undefined | void
    ): MochaSuite;
}

export interface ContextualSuite extends ExclusiveContextualSuite {
    skip: ExclusiveContextualSuite;
    only: ExclusiveContextualSuite;
}

/**
 * Wrap both the normal suite/describe function with enforcement that the method can never be called:
 * - With a method that returns a promise
 *   - native mocha does not respect async invocations and carries on leading to race conditions.
 * - Inside another test or hook (besides suites)
 *
 * Return-type is raw test suite from mocha.
 */
export const contextualSuiteIdentifier = identifier<ContextualSuite>();
const contextualSuiteBinding = bind(contextualSuiteIdentifier)
    .withDependencies([suiteIdentifier])
    .withProvider(suite => {
        const withExclusives =
            (suiteFn: ExclusiveSuiteFunction): ExclusiveContextualSuite =>
            (title: string, fn: (this: MochaSuite) => unknown): MochaSuite => {
                checkLock();

                return suiteFn(title, function (this: MochaSuite): void {
                    const result = fn.call(this);
                    if (result instanceof Promise) {
                        throw new TypeError(
                            'Suite callback must be synchronous'
                        );
                    }
                });
            };

        return Object.assign(withExclusives(suite), {
            only: withExclusives(suite.only),
            skip: withExclusives(suite.skip as ExclusiveSuiteFunction),
        });
    })
    .scoped(singletonScope);

export const suiteModule = createModule(contextualSuiteBinding);

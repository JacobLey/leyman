import { bind, createModule, identifier, singletonScope } from 'haystack-di';
import type { Context as MochaContext, Done, ExclusiveTestFunction, Test as MochaTest } from 'mocha';
import { testIdentifier } from '#mocha-module';
import { 
    type ExclusiveEntrypointTest, 
    type GenericContextualTest, 
    type ValidDoneReturnTypes,
    wrapTestWithContext, 
    wrapTestWithEntrypoint,
} from './lib/test-wrapper.js';

export interface ExclusiveContextualTest<ExistingContext extends object> extends GenericContextualTest {
    (
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => ValidDoneReturnTypes
    ): MochaTest;
    (
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext) => void
    ): MochaTest;
}
export interface ContextualTest<ExistingContext extends object> extends ExclusiveContextualTest<ExistingContext> {
    skip: ExclusiveContextualTest<ExistingContext>;
    only: ExclusiveContextualTest<ExistingContext>;
}

export interface ContextualTestGenerator {
    <ExistingContext extends object>(ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>,): ContextualTest<ExistingContext>,
}

/**
 * Using incoming promise of context, create the actual test function to be exposed to end-users.
 * 
 * Wrap both the normal test function, as well as the modiying only/skip methods with corresponding names.
 * 
 * Return-type is raw test instance from mocha.
 */
export const contextualTestGeneratorIdentifier = identifier<ContextualTestGenerator>();
const contextualTestBinding = bind(contextualTestGeneratorIdentifier).withDependencies([
    testIdentifier
]).withProvider(test => {

    return <ExistingContext extends object>(ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>,) => {

        const withExclusives = (testFn: ExclusiveTestFunction) => {
            return (
                title: string,
                cb: (this: MochaContext, ctx: ExistingContext, done: Done) => void
            ): MochaTest => {
                return wrapTestWithContext(
                    testFn,
                    ctxProm,
                    title,
                    cb
                );
            };
        };
        
        return Object.assign(
            withExclusives(test),
            {
                only: withExclusives(test.only),
                skip: withExclusives(test.skip),
            }
        );
    };
}).scoped(singletonScope);

export interface EntrypointTest extends ExclusiveEntrypointTest {
    skip: ExclusiveEntrypointTest;
    only: ExclusiveEntrypointTest;
}

/**
 * Create entrypoint test by providing an empty context, the wrapping
 * in method that ignores the context.
 */
export const entrypointTestIdentifier = identifier<EntrypointTest>();
const entrypointTestBinding = bind(entrypointTestIdentifier).withDependencies([
    contextualTestGeneratorIdentifier,
]).withProvider(contextualTestGenerator => {
    const contextualTest = contextualTestGenerator({
        get: () => Promise.resolve({})
    });
    return Object.assign(
        wrapTestWithEntrypoint(contextualTest),
        {
            only:  wrapTestWithEntrypoint(contextualTest.only),
            skip:  wrapTestWithEntrypoint(contextualTest.skip),
        }
    );
}).scoped(singletonScope);

export const testModule = createModule(
    contextualTestBinding
).addBinding(entrypointTestBinding);
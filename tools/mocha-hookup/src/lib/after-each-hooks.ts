import { bind, createModule, identifier, singletonScope } from 'haystack-di';
import type { Context as MochaContext, Done, Test as MochaTest } from 'mocha';
import { afterEachIdentifier } from '#mocha-module';
import { GenericContextualHook, wrapPerTestHookWithContext, wrapHookWithEntrypoint } from './lib/hook-wrapper.js';
import type { AllowableAdditionalContext, MergeContext } from './lib/merge-context.js';

interface ContextualAfterEachHook<ExistingContext extends object> extends GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): AfterEachChain<ExistingContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): AfterEachChain<ExistingContext, AdditionalContext>;
}
export interface AfterEachChain<ExistingContext extends object, AdditionalContext extends AllowableAdditionalContext> {
    afterEach: ContextualAfterEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    teardown: ContextualAfterEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}

export interface ContextualAfterEachGenerator {
    <ExistingContext extends object>(ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>): ContextualAfterEachHook<ExistingContext>,
}

/**
 * Implement context propagation, to create chain-able hooks.
 * 
 * Using incoming promise of context, create the actual function to be exposed to end-users under multiple aliases.
 * 
 * These exposed methods will return their own context, and will re-use the contextual generator.
 */
export const contextualAfterEachGeneratorIdentifier = identifier<ContextualAfterEachGenerator>();
const contextualAfterEachBinding = bind(contextualAfterEachGeneratorIdentifier).withDependencies([
    afterEachIdentifier
]).withProvider(afterEach => {
    const contextualAfterEach: ContextualAfterEachGenerator = <ExistingContext extends object>(ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>) => {
        return (<AdditionalContext extends AllowableAdditionalContext>(...args: [
            (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
        ] | [
            string,
            (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
        ]): AfterEachChain<ExistingContext, AdditionalContext> => {
            const mergedContext = wrapPerTestHookWithContext(
                afterEach,
                ctxProm,
                args
            );

            const afterEachs = contextualAfterEach(mergedContext);
            
            return {
                afterEach: afterEachs,
                teardown: afterEachs,
            };
        });
    };
    return contextualAfterEach;
}).scoped(singletonScope);

export interface EntrypointAfterEachHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterEachChain<{}, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterEachChain<{}, AdditionalContext>;
}

/**
 * Create the entrypoint version of hook.
 * 
 * Provide generator with empty context, then wrap in callback to ignore initial context.
 */
export const entrypointAfterEachIdentifier = identifier<EntrypointAfterEachHook>();
const entrypointAfterEachBinding = bind(entrypointAfterEachIdentifier).withDependencies([
    contextualAfterEachGeneratorIdentifier,
]).withProvider(contextualAfterEachGenerator => {
    const contextualAfterEach = contextualAfterEachGenerator({
        get: () => Promise.resolve({})
    });
    return wrapHookWithEntrypoint(contextualAfterEach) as EntrypointAfterEachHook;
}).scoped(singletonScope);

export const afterEachModule = createModule(
    contextualAfterEachBinding
).addBinding(entrypointAfterEachBinding);
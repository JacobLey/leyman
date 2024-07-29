import type { Done, Context as MochaContext, Test as MochaTest } from 'mocha';
import { bind, createModule, identifier, singletonScope } from 'haywire';
import { afterEachIdentifier } from '#mocha-module';
import {
    type GenericContextualHook,
    wrapHookWithEntrypoint,
    wrapPerTestHookWithContext,
} from './lib/hook-wrapper.js';
import type { AllowableAdditionalContext, MergeContext } from './lib/merge-context.js';

export interface ContextualAfterEachHook<ExistingContext extends object>
    extends GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): AfterEachChain<ExistingContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): AfterEachChain<ExistingContext, AdditionalContext>;
}
export interface AfterEachChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> {
    afterEach: ContextualAfterEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    teardown: ContextualAfterEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}

type ContextualAfterEachGenerator = <ExistingContext extends object>(
    ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>
) => ContextualAfterEachHook<ExistingContext>;

/**
 * Implement context propagation, to create chain-able hooks.
 *
 * Using incoming promise of context, create the actual function to be exposed to end-users under multiple aliases.
 *
 * These exposed methods will return their own context, and will re-use the contextual generator.
 */
export const contextualAfterEachGeneratorIdentifier = identifier<ContextualAfterEachGenerator>();
const contextualAfterEachBinding = bind(contextualAfterEachGeneratorIdentifier)
    .withDependencies([afterEachIdentifier])
    .withProvider(afterEach => {
        const contextualAfterEach: ContextualAfterEachGenerator =
            <ExistingContext extends object>(
                ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>
            ) =>
            <AdditionalContext extends AllowableAdditionalContext>(
                ...args:
                    | [
                          string,
                          (
                              this: MochaContext,
                              ctx: ExistingContext,
                              done: Done
                          ) => AdditionalContext,
                      ]
                    | [(this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext]
            ): AfterEachChain<ExistingContext, AdditionalContext> => {
                const mergedContext = wrapPerTestHookWithContext(afterEach, ctxProm, args);

                const afterEachs = contextualAfterEach(mergedContext);

                return {
                    afterEach: afterEachs,
                    teardown: afterEachs,
                };
            };
        return contextualAfterEach;
    })
    .scoped(singletonScope);

export interface EntrypointAfterEachHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterEachChain<NonNullable<unknown>, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterEachChain<NonNullable<unknown>, AdditionalContext>;
}

/**
 * Create the entrypoint version of hook.
 *
 * Provide generator with empty context, then wrap in callback to ignore initial context.
 */
export const entrypointAfterEachIdentifier = identifier<EntrypointAfterEachHook>();
const entrypointAfterEachBinding = bind(entrypointAfterEachIdentifier)
    .withDependencies([contextualAfterEachGeneratorIdentifier])
    .withProvider(contextualAfterEachGenerator => {
        const contextualAfterEach = contextualAfterEachGenerator({
            get: async () => ({}),
        });
        return wrapHookWithEntrypoint(contextualAfterEach) as EntrypointAfterEachHook;
    })
    .scoped(singletonScope);

export const afterEachModule = createModule(contextualAfterEachBinding).addBinding(
    entrypointAfterEachBinding
);

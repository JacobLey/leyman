import type { Done, Context as MochaContext } from 'mocha';
import { bind, createModule, identifier, singletonScope } from 'haywire';
import { afterIdentifier } from '#mocha-module';
import {
    type GenericContextualHook,
    wrapHookWithEntrypoint,
    wrapOneTimeHookWithContext,
} from './lib/hook-wrapper.js';
import type { AllowableAdditionalContext, MergeContext } from './lib/merge-context.js';

interface ContextualAfterHook<ExistingContext extends object> extends GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): AfterChain<ExistingContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): AfterChain<ExistingContext, AdditionalContext>;
}
export interface AfterChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> {
    after: ContextualAfterHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    suiteTeardown: ContextualAfterHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}

export type ContextualAfterGenerator = <ExistingContext extends object>(
    ctxProm: Promise<ExistingContext>
) => ContextualAfterHook<ExistingContext>;

export const contextualAfterGeneratorIdentifier = identifier<ContextualAfterGenerator>();
const contextualAfterBinding = bind(contextualAfterGeneratorIdentifier)
    .withDependencies([afterIdentifier])
    .withProvider(after => {
        const contextualAfter: ContextualAfterGenerator =
            <ExistingContext extends object>(ctxProm: Promise<ExistingContext>) =>
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
            ): AfterChain<ExistingContext, AdditionalContext> => {
                const mergedContext = wrapOneTimeHookWithContext(after, ctxProm, args);

                const afters = contextualAfter(mergedContext);

                return {
                    after: afters,
                    suiteTeardown: afters,
                };
            };
        return contextualAfter;
    })
    .scoped(singletonScope);

export interface EntrypointAfterHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterChain<NonNullable<unknown>, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterChain<NonNullable<unknown>, AdditionalContext>;
}

export const entrypointAfterIdentifier = identifier<EntrypointAfterHook>();
const entrypointAfterBinding = bind(entrypointAfterIdentifier)
    .withDependencies([contextualAfterGeneratorIdentifier])
    .withProvider(contextualAfterGenerator => {
        const contextualAfter = contextualAfterGenerator(Promise.resolve({}));
        return wrapHookWithEntrypoint(contextualAfter) as EntrypointAfterHook;
    })
    .scoped(singletonScope);

export const afterModule = createModule(contextualAfterBinding).addBinding(entrypointAfterBinding);

import type { Done, Context as MochaContext, Test as MochaTest } from 'mocha';
import type { AfterEachChain } from './after-each-hooks.js';
import type { GenericContextualHook } from './lib/hook-wrapper.js';
import type { AllowableAdditionalContext, MergeContext } from './lib/merge-context.js';
import type { ContextualTest, ExclusiveContextualTest } from './test-hooks.js';
import { bind, createModule, identifier, singletonScope } from 'haywire';
import { beforeEachIdentifier } from '#mocha-module';
import { contextualAfterEachGeneratorIdentifier } from './after-each-hooks.js';
import { wrapHookWithEntrypoint, wrapPerTestHookWithContext } from './lib/hook-wrapper.js';
import { contextualTestGeneratorIdentifier } from './test-hooks.js';

interface ContextualBeforeEachHook<ExistingContext extends object> extends GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): BeforeEachChain<ExistingContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): BeforeEachChain<ExistingContext, AdditionalContext>;
}
export interface BeforeEachChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> extends AfterEachChain<ExistingContext, AdditionalContext> {
    // BeforeEach
    beforeEach: ContextualBeforeEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    setup: ContextualBeforeEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;

    // Test
    it: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    xit: ExclusiveContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    specify: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    test: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}

export type ContextualBeforeEachGenerator = <ExistingContext extends object>(
    ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>
) => ContextualBeforeEachHook<ExistingContext>;

export const contextualBeforeEachGeneratorIdentifier = identifier<ContextualBeforeEachGenerator>();
const contextualBeforeEachBinding = bind(contextualBeforeEachGeneratorIdentifier)
    .withDependencies([
        beforeEachIdentifier,
        contextualTestGeneratorIdentifier,
        contextualAfterEachGeneratorIdentifier,
    ])
    .withProvider((beforeEach, testGenerator, afterEachGenerator) => {
        const contextualBeforeEach: ContextualBeforeEachGenerator =
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
            ): BeforeEachChain<ExistingContext, AdditionalContext> => {
                const mergedContext = wrapPerTestHookWithContext(beforeEach, ctxProm, args);

                const beforeEachs = contextualBeforeEach(mergedContext);
                const tests = testGenerator(mergedContext);
                const afterEachs = afterEachGenerator(mergedContext);

                return {
                    beforeEach: beforeEachs,
                    setup: beforeEachs,
                    it: tests,
                    xit: tests.skip,
                    specify: tests,
                    test: tests,
                    afterEach: afterEachs,
                    teardown: afterEachs,
                };
            };
        return contextualBeforeEach;
    })
    .scoped(singletonScope);

export interface EntrypointBeforeEachHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeEachChain<NonNullable<unknown>, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeEachChain<NonNullable<unknown>, AdditionalContext>;
}

export const entrypointBeforeEachIdentifier = identifier<EntrypointBeforeEachHook>();
const entrypointBeforeEachBinding = bind(entrypointBeforeEachIdentifier)
    .withDependencies([contextualBeforeEachGeneratorIdentifier])
    .withProvider(contextualBeforeEachGenerator => {
        const contextualBeforeEach = contextualBeforeEachGenerator({
            get: async () => ({}),
        });
        return wrapHookWithEntrypoint(contextualBeforeEach) as EntrypointBeforeEachHook;
    })
    .scoped(singletonScope);

export const beforeEachModule = createModule(contextualBeforeEachBinding).addBinding(
    entrypointBeforeEachBinding
);

import { bind, createModule, identifier, singletonScope } from 'haystack-di';
import type { Context as MochaContext, Done, Test as MochaTest } from 'mocha';
import { type AfterEachChain, contextualAfterEachGeneratorIdentifier } from './after-each-hooks.js';
import { beforeEachIdentifier } from '#mocha-module';
import { type ContextualTest, contextualTestGeneratorIdentifier, type ExclusiveContextualTest } from './test-hooks.js';
import { type GenericContextualHook, wrapPerTestHookWithContext, wrapHookWithEntrypoint } from './lib/hook-wrapper.js';
import type { AllowableAdditionalContext, MergeContext } from './lib/merge-context.js';

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
    AdditionalContext extends AllowableAdditionalContext
> extends AfterEachChain<ExistingContext, AdditionalContext> {
    // beforeEach
    beforeEach: ContextualBeforeEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    setup: ContextualBeforeEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;

    // test
    it: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    xit: ExclusiveContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    specify: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    test: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}

export interface ContextualBeforeEachGenerator {
    <ExistingContext extends object>(ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>): ContextualBeforeEachHook<ExistingContext>,
}

export const contextualBeforeEachGeneratorIdentifier = identifier<ContextualBeforeEachGenerator>();
const contextualBeforeEachBinding = bind(contextualBeforeEachGeneratorIdentifier).withDependencies([
    beforeEachIdentifier,
    contextualTestGeneratorIdentifier,
    contextualAfterEachGeneratorIdentifier,
]).withProvider((beforeEach, testGenerator, afterEachGenerator) => {
    const contextualBeforeEach: ContextualBeforeEachGenerator = <ExistingContext extends object>(ctxProm: Pick<WeakMap<MochaTest, Promise<ExistingContext>>, 'get'>) => {
        return (<AdditionalContext extends AllowableAdditionalContext>(...args: [
            (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
        ] | [
            string,
            (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
        ]): BeforeEachChain<ExistingContext, AdditionalContext> => {
            const mergedContext = wrapPerTestHookWithContext(
                beforeEach,
                ctxProm,
                args
            );

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
        });
    };
    return contextualBeforeEach;
}).scoped(singletonScope);

export interface EntrypointBeforeEachHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeEachChain<{}, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeEachChain<{}, AdditionalContext>;
}

export const entrypointBeforeEachIdentifier = identifier<EntrypointBeforeEachHook>();
const entrypointBeforeEachBinding = bind(entrypointBeforeEachIdentifier).withDependencies([
    contextualBeforeEachGeneratorIdentifier,
]).withProvider(contextualBeforeEachGenerator => {
    const contextualBeforeEach = contextualBeforeEachGenerator({
        get: () => Promise.resolve({})
    });
    return wrapHookWithEntrypoint(contextualBeforeEach) as EntrypointBeforeEachHook;
}).scoped(singletonScope);

export const beforeEachModule = createModule(
    contextualBeforeEachBinding
).addBinding(entrypointBeforeEachBinding);
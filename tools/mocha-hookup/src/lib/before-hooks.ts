import { bind, createModule, identifier, singletonScope } from 'haystack-di';
import type { Context as MochaContext, Done } from 'mocha';
import { contextualAfterEachGeneratorIdentifier } from './after-each-hooks.js';
import { type AfterChain, contextualAfterGeneratorIdentifier } from './after-hooks.js';
import { type BeforeEachChain, contextualBeforeEachGeneratorIdentifier } from './before-each-hooks.js';
import { beforeIdentifier } from '#mocha-module';
import { contextualTestGeneratorIdentifier } from './test-hooks.js';
import { GenericContextualHook, wrapOneTimeHookWithContext, wrapHookWithEntrypoint } from './lib/hook-wrapper.js';
import type { AllowableAdditionalContext, MergeContext } from './lib/merge-context.js';

interface ContextualBeforeHook<ExistingContext extends object> extends GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): BeforeChain<ExistingContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): BeforeChain<ExistingContext, AdditionalContext>;
}
interface BeforeChain<
    ExistingContext extends object, 
    AdditionalContext extends AllowableAdditionalContext
> extends AfterChain<ExistingContext, AdditionalContext>, BeforeEachChain<ExistingContext, AdditionalContext> {
    before: ContextualBeforeHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    suiteSetup: ContextualBeforeHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}

export interface ContextualBeforeGenerator {
    <ExistingContext extends object>(ctxProm: Promise<ExistingContext>): ContextualBeforeHook<ExistingContext>,
}

export const contextualBeforeGeneratorIdentifier = identifier<ContextualBeforeGenerator>();
const contextualBeforeBinding = bind(contextualBeforeGeneratorIdentifier).withDependencies([
    beforeIdentifier,
    contextualBeforeEachGeneratorIdentifier,
    contextualTestGeneratorIdentifier,
    contextualAfterEachGeneratorIdentifier,
    contextualAfterGeneratorIdentifier,
]).withProvider((before, beforeEachGenerator, testGenerator, afterEachGenerator, afterGenerator) => {
    const contextualBefore: ContextualBeforeGenerator = <ExistingContext extends object>(ctxProm: Promise<ExistingContext>) => {
        return (<AdditionalContext extends AllowableAdditionalContext>(...args: [
            (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
        ] | [
            string,
            (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
        ]): BeforeChain<ExistingContext, AdditionalContext> => {
            const mergedContext = wrapOneTimeHookWithContext(
                before,
                ctxProm,
                args
            );

            const fakeWeakMap = {
                get: () => mergedContext
            };
            const befores = contextualBefore(mergedContext);
            const beforeEachs = beforeEachGenerator(fakeWeakMap);
            const tests = testGenerator(fakeWeakMap);
            const afterEachs = afterEachGenerator(fakeWeakMap);
            const afters = afterGenerator(mergedContext);
            
            return {
                before: befores,
                suiteSetup: befores,
                beforeEach: beforeEachs,
                setup: beforeEachs,
                it: tests,
                xit: tests.skip,
                specify: tests,
                test: tests,
                afterEach: afterEachs,
                teardown: afterEachs,
                after: afters,
                suiteTeardown: afters,
            };
        });
    };
    return contextualBefore;
}).scoped(singletonScope);

export interface EntrypointBeforeHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeChain<{}, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeChain<{}, AdditionalContext>;
}

export const entrypointBeforeIdentifier = identifier<EntrypointBeforeHook>();
const entrypointBeforeBinding = bind(entrypointBeforeIdentifier).withDependencies([
    contextualBeforeGeneratorIdentifier,
]).withProvider(contextualBeforeGenerator => {
    const contextualBefore = contextualBeforeGenerator(Promise.resolve({}));
    return wrapHookWithEntrypoint(contextualBefore) as EntrypointBeforeHook;
}).scoped(singletonScope);

export const beforeModule = createModule(
    contextualBeforeBinding
).addBinding(entrypointBeforeBinding);
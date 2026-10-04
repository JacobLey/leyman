import type { Done, Context as MochaContext, Suite as MochaSuite, Test as MochaTest } from 'mocha';
import type { AllowableAdditionalContext, EmptyContext, MergeContext } from 'test-chain-core';

export type ValidDoneReturnTypes = '' | 0 | 0n | false | null | undefined | void;

export interface GenericContextualHook {
    (fn: (this: MochaContext, ctx: object, done: Done) => AllowableAdditionalContext): object;
    (
        name: string,
        fn: (this: MochaContext, ctx: object, done: Done) => AllowableAdditionalContext
    ): object;
}

export interface GenericContextualTest {
    (
        name: string,
        fn: (this: MochaContext, ctx: object, done: Done) => ValidDoneReturnTypes
    ): MochaTest;
    (name: string, fn: (this: MochaContext, ctx: object) => Promise<void> | void): MochaTest;
}

// Test

export interface ExclusiveContextualTest<ExistingContext extends object>
    extends GenericContextualTest {
    (
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => ValidDoneReturnTypes
    ): MochaTest;
    (name: string, fn: (this: MochaContext, ctx: ExistingContext) => Promise<void>): MochaTest;
}
export interface ContextualTest<ExistingContext extends object>
    extends ExclusiveContextualTest<ExistingContext> {
    skip: ExclusiveContextualTest<ExistingContext>;
    only: ExclusiveContextualTest<ExistingContext>;
}

export interface ExclusiveEntrypointTest {
    (name: string, fn: (this: MochaContext, done: Done) => ValidDoneReturnTypes): MochaTest;
    (name: string, fn: (this: MochaContext) => Promise<void> | void): MochaTest;
}
export interface EntrypointTest extends ExclusiveEntrypointTest {
    skip: ExclusiveEntrypointTest;
    only: ExclusiveEntrypointTest;
}

// After Each

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
export interface EntrypointAfterEachHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterEachChain<EmptyContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterEachChain<EmptyContext, AdditionalContext>;
}

// After

export interface ContextualAfterHook<ExistingContext extends object> extends GenericContextualHook {
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
export interface EntrypointAfterHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterChain<EmptyContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): AfterChain<EmptyContext, AdditionalContext>;
}

// Before Each

export interface ContextualBeforeEachHook<ExistingContext extends object>
    extends GenericContextualHook {
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
export interface EntrypointBeforeEachHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeEachChain<EmptyContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeEachChain<EmptyContext, AdditionalContext>;
}

// Before

export interface ContextualBeforeHook<ExistingContext extends object>
    extends GenericContextualHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): BeforeChain<ExistingContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, ctx: ExistingContext, done: Done) => AdditionalContext
    ): BeforeChain<ExistingContext, AdditionalContext>;
}
export interface BeforeChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> extends AfterChain<ExistingContext, AdditionalContext>,
        BeforeEachChain<ExistingContext, AdditionalContext> {
    before: ContextualBeforeHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    suiteSetup: ContextualBeforeHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export interface EntrypointBeforeHook {
    <AdditionalContext extends AllowableAdditionalContext>(
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeChain<EmptyContext, AdditionalContext>;
    <AdditionalContext extends AllowableAdditionalContext>(
        name: string,
        fn: (this: MochaContext, done: Done) => AdditionalContext
    ): BeforeChain<EmptyContext, AdditionalContext>;
}

// Suite

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
    (title: string, fn: (this: MochaSuite) => null | undefined | void): MochaSuite;
}

export interface ContextualSuite extends ExclusiveContextualSuite {
    skip: ExclusiveContextualSuite;
    only: ExclusiveContextualSuite;
}

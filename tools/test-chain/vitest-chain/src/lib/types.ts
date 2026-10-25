import type * as vitest from 'vitest';
import type {
    AllowableAdditionalContext,
    CheckedAdditionalContext,
    EmptyContext,
    MergeContext,
} from 'test-chain-core';

/**
 * Arguments vitest passes to each kind of hook/test.
 *
 * `beforeAll`/`afterAll` are derived from vitest's own signatures. Per-test hooks are declared with a second `suite`
 * argument there, but vitest calls them with the test context alone.
 */
export type BeforeAllArgs = Parameters<Parameters<typeof vitest.beforeAll>[0]>;
export type AfterAllArgs = Parameters<Parameters<typeof vitest.afterAll>[0]>;
export type BeforeEachArgs = [context: vitest.TestContext];
export type AfterEachArgs = [context: vitest.TestContext];
export type TestArgs = [context: vitest.TestContext];

// Test

export type ExclusiveContextualTest<ExistingContext extends object> = (
    name: string,
    fn: (ctx: ExistingContext, ...args: TestArgs) => Promise<void> | void
) => void;
export interface ContextualTest<ExistingContext extends object>
    extends ExclusiveContextualTest<ExistingContext> {
    skip: ExclusiveContextualTest<ExistingContext>;
    only: ExclusiveContextualTest<ExistingContext>;
}

export type ExclusiveEntrypointTest = (
    name: string,
    fn: (...args: TestArgs) => Promise<void> | void
) => void;
export interface EntrypointTest extends ExclusiveEntrypointTest {
    skip: ExclusiveEntrypointTest;
    only: ExclusiveEntrypointTest;
}

// After Each

export type ContextualAfterEachHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (
        ctx: ExistingContext,
        ...args: AfterEachArgs
    ) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => AfterEachChain<ExistingContext, AdditionalContext>;
export interface AfterEachChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> {
    afterEach: ContextualAfterEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointAfterEachHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: AfterEachArgs) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => AfterEachChain<EmptyContext, AdditionalContext>;

// After All

export type ContextualAfterAllHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (
        ctx: ExistingContext,
        ...args: AfterAllArgs
    ) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => AfterAllChain<ExistingContext, AdditionalContext>;
export interface AfterAllChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> {
    afterAll: ContextualAfterAllHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointAfterAllHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: AfterAllArgs) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => AfterAllChain<EmptyContext, AdditionalContext>;

// Before Each

export type ContextualBeforeEachHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (
        ctx: ExistingContext,
        ...args: BeforeEachArgs
    ) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => BeforeEachChain<ExistingContext, AdditionalContext>;
export interface BeforeEachChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> extends AfterEachChain<ExistingContext, AdditionalContext> {
    beforeEach: ContextualBeforeEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    it: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
    test: ContextualTest<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointBeforeEachHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: BeforeEachArgs) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => BeforeEachChain<EmptyContext, AdditionalContext>;

// Before All

export type ContextualBeforeAllHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (
        ctx: ExistingContext,
        ...args: BeforeAllArgs
    ) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => BeforeAllChain<ExistingContext, AdditionalContext>;
export interface BeforeAllChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> extends AfterAllChain<ExistingContext, AdditionalContext>,
        BeforeEachChain<ExistingContext, AdditionalContext> {
    beforeAll: ContextualBeforeAllHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointBeforeAllHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: BeforeAllArgs) => AdditionalContext & CheckedAdditionalContext<AdditionalContext>
) => BeforeAllChain<EmptyContext, AdditionalContext>;

// Describe

export type ExclusiveContextualDescribe = (name: string, fn: () => Promise<void> | void) => void;
export interface ContextualDescribe extends ExclusiveContextualDescribe {
    skip: ExclusiveContextualDescribe;
    only: ExclusiveContextualDescribe;
}

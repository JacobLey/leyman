import type * as vitest from 'vitest';
import type { AllowableAdditionalContext, MergeContext } from 'test-chain-core';

/**
 * Arguments vitest passes to each kind of hook/test.
 *
 * Derived from vitest's own signatures so they stay in sync across versions.
 */
export type BeforeAllArgs = Parameters<Parameters<typeof vitest.beforeAll>[0]>;
export type AfterAllArgs = Parameters<Parameters<typeof vitest.afterAll>[0]>;
export type BeforeEachArgs = Parameters<Parameters<typeof vitest.beforeEach>[0]>;
export type AfterEachArgs = Parameters<Parameters<typeof vitest.afterEach>[0]>;
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
    fn: (ctx: ExistingContext, ...args: AfterEachArgs) => AdditionalContext
) => AfterEachChain<ExistingContext, AdditionalContext>;
export interface AfterEachChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> {
    afterEach: ContextualAfterEachHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointAfterEachHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: AfterEachArgs) => AdditionalContext
) => AfterEachChain<NonNullable<unknown>, AdditionalContext>;

// After All

export type ContextualAfterAllHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (ctx: ExistingContext, ...args: AfterAllArgs) => AdditionalContext
) => AfterAllChain<ExistingContext, AdditionalContext>;
export interface AfterAllChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> {
    afterAll: ContextualAfterAllHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointAfterAllHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: AfterAllArgs) => AdditionalContext
) => AfterAllChain<NonNullable<unknown>, AdditionalContext>;

// Before Each

export type ContextualBeforeEachHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (ctx: ExistingContext, ...args: BeforeEachArgs) => AdditionalContext
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
    fn: (...args: BeforeEachArgs) => AdditionalContext
) => BeforeEachChain<NonNullable<unknown>, AdditionalContext>;

// Before All

export type ContextualBeforeAllHook<ExistingContext extends object> = <
    AdditionalContext extends AllowableAdditionalContext,
>(
    fn: (ctx: ExistingContext, ...args: BeforeAllArgs) => AdditionalContext
) => BeforeAllChain<ExistingContext, AdditionalContext>;
export interface BeforeAllChain<
    ExistingContext extends object,
    AdditionalContext extends AllowableAdditionalContext,
> extends AfterAllChain<ExistingContext, AdditionalContext>,
        BeforeEachChain<ExistingContext, AdditionalContext> {
    beforeAll: ContextualBeforeAllHook<MergeContext<ExistingContext, Awaited<AdditionalContext>>>;
}
export type EntrypointBeforeAllHook = <AdditionalContext extends AllowableAdditionalContext>(
    fn: (...args: BeforeAllArgs) => AdditionalContext
) => BeforeAllChain<NonNullable<unknown>, AdditionalContext>;

// Describe

export type ExclusiveContextualDescribe = (name: string, fn: () => Promise<void> | void) => void;
export interface ContextualDescribe extends ExclusiveContextualDescribe {
    skip: ExclusiveContextualDescribe;
    only: ExclusiveContextualDescribe;
}

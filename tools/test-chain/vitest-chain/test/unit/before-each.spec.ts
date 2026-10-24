import * as vitest from 'vitest';
import { beforeEach, describe } from 'vitest-chain';

const { expect, expectTypeOf } = vitest;

describe('beforeEach', () => {
    let count = 0;

    const contextualBeforeEach = beforeEach(({ task }) => {
        ++count;
        return { count, name: task.name };
    });

    const mergedBeforeEach = contextualBeforeEach.beforeEach(async (ctx, { task }) => {
        expect(ctx.name).toBe(task.name);

        return { doubled: ctx.count * 2 };
    });

    mergedBeforeEach.test('First test', ctx => {
        expect(ctx).toEqual({ count: 1, name: 'First test', doubled: 2 });
        expectTypeOf(ctx).toEqualTypeOf<{ count: number; name: string; doubled: number }>();
    });

    describe('Inside another suite', () => {
        mergedBeforeEach.it('Second test', ctx => {
            expect(ctx).toEqual({ count: 2, name: 'Second test', doubled: 4 });
        });
    });

    contextualBeforeEach.test.skip('Skipped test', () => {
        throw new Error('<ERROR>');
    });

    mergedBeforeEach
        .afterEach((ctx, { task }) => {
            expect(ctx.name).toBe(task.name);
            return { cleaned: true };
        })
        .afterEach(ctx => {
            expect(ctx.cleaned).toBe(true);
            expectTypeOf(ctx).toEqualTypeOf<{
                count: number;
                name: string;
                doubled: number;
                cleaned: boolean;
            }>();
        });

    vitest.afterAll(() => {
        expect(count).toBe(2);
    });
});

describe('beforeEach native arguments', () => {
    const withArgs = beforeEach((...args) => {
        expectTypeOf(args).toEqualTypeOf<[vitest.TestContext]>();
        return { entrypoint: args.length };
    }).beforeEach((_ctx, ...args) => {
        expectTypeOf(args).toEqualTypeOf<[vitest.TestContext]>();
        return { chained: args.length };
    });

    withArgs.afterEach((_ctx, ...args) => {
        expectTypeOf(args).toEqualTypeOf<[vitest.TestContext]>();
        expect(args).toHaveLength(1);
    });

    withArgs.test('Only the test context', ctx => {
        expect(ctx).toEqual({ entrypoint: 1, chained: 1 });
    });
});

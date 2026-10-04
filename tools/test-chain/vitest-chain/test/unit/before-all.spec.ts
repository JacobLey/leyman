import * as vitest from 'vitest';
import { beforeAll, describe } from 'vitest-chain';

const { expect, expectTypeOf } = vitest;

describe('beforeAll', () => {
    const order: number[] = [];

    const contextualBeforeAll = beforeAll((_ctx, suite) => {
        expect(order).toEqual([]);
        order.push(1);

        expect(suite.name).toBe('beforeAll');

        return { abc: 123 as const };
    });

    const mergedBeforeAll = contextualBeforeAll.beforeAll(async (ctx, _vitestCtx, suite) => {
        expect(order).toEqual([1]);
        order.push(2);

        expect(ctx).toEqual({ abc: 123 });
        expectTypeOf(ctx).toEqualTypeOf<{ abc: 123 }>();
        expect(suite.name).toBe('beforeAll');

        return { efg: true };
    });

    contextualBeforeAll
        .beforeAll(ctx => {
            // Mutations do not leak into other hooks
            delete (ctx as Partial<typeof ctx>).abc;
            return null;
        })
        .beforeAll(ctx => {
            expect(order).toEqual([1, 2]);
            order.push(3);

            expect(ctx).toEqual({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{ abc: 123 }>();
        });

    mergedBeforeAll.test('Receives merged context', (ctx, { task }) => {
        expect(order).toEqual([1, 2, 3]);

        expect(ctx).toEqual({ abc: 123, efg: true });
        expectTypeOf(ctx).toEqualTypeOf<{ abc: 123; efg: boolean }>();
        expect(task.name).toBe('Receives merged context');
    });

    mergedBeforeAll
        .beforeEach(ctx => ({ count: Object.keys(ctx).length }))
        .it('Chains into beforeEach', ctx => {
            expect(ctx).toEqual({ abc: 123, efg: true, count: 2 });
            expectTypeOf(ctx).toEqualTypeOf<{ abc: 123; efg: boolean; count: number }>();
        });

    mergedBeforeAll.afterEach(ctx => {
        expect(ctx).toEqual({ abc: 123, efg: true });
    });

    mergedBeforeAll
        .afterAll(ctx => {
            expect(order).toEqual([1, 2, 3]);
            order.push(4);

            expect(ctx).toEqual({ abc: 123, efg: true });

            return { xyz: 789 };
        })
        .afterAll(ctx => {
            expect(order).toEqual([1, 2, 3, 4]);
            order.push(5);

            expect(ctx).toEqual({ abc: 123, efg: true, xyz: 789 });
            expectTypeOf(ctx).toEqualTypeOf<{ abc: 123; efg: boolean; xyz: number }>();
        });

    vitest.afterAll(() => {
        expect(order).toEqual([1, 2, 3, 4, 5]);
    });
});

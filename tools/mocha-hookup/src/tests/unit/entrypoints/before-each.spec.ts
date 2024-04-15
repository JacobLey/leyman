import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { beforeEach, suite } from 'mocha-hookup';

const order: number[] = [];

suite('beforeEach', () => {
    suite('Inside a suite', () => {
        mocha.beforeEach(() => {
            expect(order).to.deep.equal([]);
            order.push(1);
        });

        const contextualBeforeEach = beforeEach(done => {
            expect(order).to.deep.equal([1]);
            order.push(2);

            setTimeout(() => {
                done();
            }, 5);

            return { abc: 123 } as const;
        });

        const mergedBeforeEach = contextualBeforeEach.beforeEach(async ctx => {
            expect(order).to.deep.equal([1, 2]);
            order.push(3);

            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{ readonly abc: 123 }>();

            return { efg: [true] };
        });

        mergedBeforeEach.afterEach('Runs after tests', async ctx => {
            expect(order).to.deep.equal([1, 2, 3, 4, 5, 6]);
            order.push(7);

            expect(ctx).to.deep.equal({
                abc: 123,
                efg: [true],
            });
            expectTypeOf(ctx).toEqualTypeOf<{
                readonly abc: 123;
                efg: boolean[];
            }>();
        });

        const tested = contextualBeforeEach.test.skip('Can skip test', async function (this) {
            expectTypeOf(this).toEqualTypeOf<mocha.Context>();
        });

        suite('Inside another suite', () => {
            contextualBeforeEach.beforeEach('Runs after outer suite', async (ctx, done) => {
                expect(order).to.deep.equal([1, 2, 3, 4]);
                order.push(5);

                expect(ctx).to.deep.equal({ abc: 123 });
                expectTypeOf(ctx).toEqualTypeOf<{ readonly abc: 123 }>();

                done();
            });

            contextualBeforeEach.xit(
                'Type enforcement on test setup',
                // @ts-expect-error
                (ctx, done): [] => {
                    expectTypeOf(ctx).toEqualTypeOf<{
                        readonly abc: 123;
                    }>();
                    expectTypeOf(tested).toEqualTypeOf<mocha.Test>();
                    done();
                    return [];
                }
            );

            mergedBeforeEach.test('Test gets context', (ctx, done) => {
                expect(order).to.deep.equal([1, 2, 3, 4, 5]);
                order.push(6);

                expect(ctx).to.deep.equal({
                    abc: 123,
                    efg: [true],
                });
                expectTypeOf(ctx).toEqualTypeOf<{
                    readonly abc: 123;
                    efg: boolean[];
                }>();

                done();
            });
        });

        contextualBeforeEach
            .beforeEach('Runs before inner suite', async (ctx, done) => {
                expect(order).to.deep.equal([1, 2, 3]);
                order.push(4);

                expect(ctx).to.deep.equal({ abc: 123 });
                expectTypeOf(ctx).toEqualTypeOf<{ readonly abc: 123 }>();

                done();

                return { xyz: ctx };
            })
            .afterEach('Runs near the end', ctx => {
                expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
                order.push(8);

                expect(ctx).to.deep.equal({
                    abc: 123,
                    xyz: { abc: 123 },
                });
                expectTypeOf(ctx).toEqualTypeOf<{
                    readonly abc: 123;
                    xyz: { readonly abc: 123 };
                }>();
            });
    });

    mocha.after(() => {
        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8]);
    });
});

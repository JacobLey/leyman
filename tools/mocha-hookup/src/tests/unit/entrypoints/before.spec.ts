import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { before, suite, suiteSetup } from 'mocha-hookup';

const order: number[] = [];

suite('before', () => {
    mocha.before(() => {
        expect(order).to.deep.equal([]);
    });

    const contextualBefore = before(() => {
        expect(order).to.deep.equal([]);
        order.push(1);

        expect(before).to.equal(suiteSetup);
        expectTypeOf(before).toEqualTypeOf(suiteSetup);

        return { abc: 123 as const };
    });

    const mergedContextualBefore = contextualBefore.suiteSetup(
        'Suite Setup with title',
        async (ctx, done) => {
            expect(order).to.deep.equal([1]);
            order.push(2);

            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{ abc: 123 }>();

            setTimeout(() => {
                done();
            }, 5);

            return { efg: true };
        }
    );

    let firstRun = true;
    const mergedBeforeEach = mergedContextualBefore.beforeEach((ctx, done) => {
        expect(order).to.deep.equal(firstRun ? [1, 2, 3] : [1, 2, 3, 4, 5]);
        firstRun = false;

        done();

        return { xyz: 789 };
    });

    suite('Chained with beforeEach', async () => {
        mergedBeforeEach.xit(
            'No async with done',
            // @ts-expect-error
            async (ctx, done) => {
                expectTypeOf(ctx).toEqualTypeOf<{
                    abc: 123;
                    efg: boolean;
                    xyz: number;
                }>();

                done();
            }
        );

        const tested = mergedBeforeEach.test(
            'Done cannot return',
            // @ts-expect-error
            (ctx, done): number => {
                expect(order).to.deep.equal([1, 2, 3]);
                order.push(4);

                expect(ctx).to.deep.equal({
                    abc: 123,
                    efg: true,
                    xyz: 789,
                });
                setImmediate(() => {
                    done();
                });
                return 0;
            }
        );

        mergedContextualBefore.afterEach(async function (this) {
            expect(order).to.deep.equal([1, 2, 3, 4]);
            order.push(5);

            expect(this.currentTest).to.equal(tested);
        });
    });

    suite('Test from before', () => {
        // eslint-disable-next-line prefer-arrow-callback
        mergedContextualBefore.it('runs test', async function (ctx) {
            expect(order).to.deep.equal([1, 2, 3, 4, 5]);
            order.push(6);

            expect(ctx).to.deep.equal({
                abc: 123,
                efg: true,
            });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: 123;
                efg: boolean;
            }>();

            return 'Yes this was successful';
        });

        mergedContextualBefore.after('After with a title', (ctx, done) => {
            expect(order).to.deep.equal([1, 2, 3, 4, 5, 6]);
            order.push(7);

            expect(ctx).to.deep.equal({
                abc: 123,
                efg: true,
            });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: 123;
                efg: boolean;
            }>();

            done();
        });
    });

    contextualBefore
        .before(ctx => {
            delete (ctx as Record<string, number>).abc;
            return null;
        })
        .suiteSetup(ctx => {
            expect(order).to.deep.equal([1, 2]);
            order.push(3);

            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{ abc: 123 }>();
        });

    mergedContextualBefore.after(async ctx => {
        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
        order.push(8);

        expect(ctx).to.deep.equal({ abc: 123, efg: true });
        expectTypeOf(ctx).toEqualTypeOf<{ abc: 123; efg: boolean }>();

        return null;
    });

    mocha.after(() => {
        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8]);
    });
});

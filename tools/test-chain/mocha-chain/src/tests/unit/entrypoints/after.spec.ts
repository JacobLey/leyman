import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { after, suite, suiteTeardown } from 'mocha-chain';

const order: number[] = [];

suite('after', () => {
    suite('Inside a suite', function (this) {
        this.retries(2);

        let shouldFail = true;
        mocha.test('Fails first time', done => {
            const isShouldFail = shouldFail;
            shouldFail = false;
            done(isShouldFail ? new Error('<ERROR>') : null);
        });

        suite('Inside another suite', () => {
            mocha.test('After is SuiteTeardown', () => {
                expect(after).to.equal(suiteTeardown);
                expectTypeOf(after).toEqualTypeOf(suiteTeardown);
            });

            after(function (this) {
                expect(order).to.deep.equal([]);
                order.push(1);

                expectTypeOf(this).toEqualTypeOf<mocha.Context>();
                expect(this.retries()).to.equal(2);
            });

            mocha.afterEach('After each runs before after', () => {
                expect(order).to.deep.equal([]);
            });
        });

        const contextualAfter = after(function (this) {
            expect(order).to.deep.equal([1]);
            order.push(2);

            expect(this.retries()).to.equal(2);

            return { abc: 123 };
        });

        mocha.suiteTeardown(() => {
            expect(order).to.deep.equal([1, 2]);
            order.push(3);
        });

        const mergedContextualAfter = contextualAfter.suiteTeardown(async (ctx, done) => {
            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: number;
            }>();
            Object.assign(ctx, { ignored: [] });
            expect(contextualAfter.after).to.equal(contextualAfter.suiteTeardown);
            expectTypeOf(contextualAfter.after).toEqualTypeOf(contextualAfter.suiteTeardown);

            setTimeout(() => {
                expect(order).to.deep.equal([1, 2, 3]);
                order.push(4);
                done();
            }, 10);

            return { efg: true } as const;
        });

        contextualAfter.suiteTeardown('Contextual suite teardown', (ctx, done) => {
            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: number;
            }>();

            expect(order).to.deep.equal([1, 2, 3, 4]);
            order.push(5);

            done();
        });

        mergedContextualAfter.after(async ctx => {
            expect(ctx).to.deep.equal({ abc: 123, efg: true });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: number;
                readonly efg: true;
            }>();

            expect(order).to.deep.equal([1, 2, 3, 4, 5]);
            order.push(6);
        });
    });

    after('After with a title', async () => {
        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6]);
        order.push(7);
    }).suiteTeardown(ctx => {
        expect(ctx).to.deep.equal({});
        expectTypeOf(ctx).toEqualTypeOf<NonNullable<unknown>>();

        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
        order.push(8);
    });

    mocha.after('Mocha enforced completion', () => {
        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8]);
    });
});

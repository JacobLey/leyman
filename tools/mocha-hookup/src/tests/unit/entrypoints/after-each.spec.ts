import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { afterEach, suite, teardown } from 'mocha-hookup';

const order: number[] = [];
let activeTest = false;

suite('afterEach', () => {

    suite('Inside a suite', function () {

        this.retries(2);

        let shouldFail = true;
        mocha.test('Fails first time', done => {
            activeTest = false;
            done(shouldFail ? new Error('<ERROR>') : null);
            shouldFail = false;
        });

        suite('Inside another suite', () => {

            const compareTest = mocha.test('afterEach is teardown', () => {
                activeTest = true;
                expect(afterEach).to.equal(teardown);
                expectTypeOf(afterEach).toEqualTypeOf(teardown);
            });

            mocha.after('After runs after _all_ afterEach', () => {
                expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                order.push(10);
            });

            afterEach(function () {
                expect(order).to.deep.equal([]);
                order.push(1);

                expectTypeOf(this).toEqualTypeOf<mocha.Context>();
                expect(this.retries()).to.equal(2);
                expect(this.currentTest).to.equal(compareTest);
            });
        });

        const contextualAfterEach = afterEach(function () {
            if (activeTest) {
                expect(order).to.deep.equal([1]);
                order.push(2);
            }

            expect(this.retries()).to.equal(2);

            return { abc: 123 };
        });

        mocha.teardown(() => {
            if (activeTest) {
                expect(order).to.deep.equal([1, 2]);
                order.push(3);
            }
        });

        const mergedContextualAfterEach = contextualAfterEach.teardown(async (ctx, done) => {
            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: number;
            }>();
            Object.assign(ctx, { ignored: [] });
            expect(contextualAfterEach.afterEach).to.equal(contextualAfterEach.teardown);
            expectTypeOf(contextualAfterEach.afterEach).toEqualTypeOf(contextualAfterEach.teardown);

            setTimeout(() => {
                if (activeTest) {
                    expect(order).to.deep.equal([1, 2, 3]);
                    order.push(4);
                }
                done();
            }, 10);

            return Promise.resolve({ efg: true } as const);
        });

        contextualAfterEach.teardown('Contextual teardown', (ctx, done) => {
            expect(ctx).to.deep.equal({ abc: 123 });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: number;
            }>();

            if (activeTest) {
                expect(order).to.deep.equal([1, 2, 3, 4]);
                order.push(5);
            }

            done();
        });

        mergedContextualAfterEach.afterEach(async (ctx) => {
            expect(ctx).to.deep.equal({ abc: 123, efg: true });
            expectTypeOf(ctx).toEqualTypeOf<{
                abc: number;
                readonly efg: true;
            }>();

            if (activeTest) {
                expect(order).to.deep.equal([1, 2, 3, 4, 5]);
                order.push(6);
            }
        });
    });

    mocha.after('Mocha enforced after completion', () => {
        expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
    
    afterEach('afterEach with a title', async done => {
    
        if (activeTest) {
            expect(order).to.deep.equal([1, 2, 3, 4, 5, 6]);
            order.push(7);
        }
    
        done();
    }).teardown(ctx => {
        expect(ctx).to.deep.equal({});
        expectTypeOf(ctx).toEqualTypeOf<{}>();
    
        if (activeTest) {
            expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7]);
            order.push(8);
        }
    });
    
    mocha.afterEach('Mocha enforced afterEach completion', () => {
    
        if (activeTest) {
            expect(order).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8]);
            order.push(9);
        }
    });
});
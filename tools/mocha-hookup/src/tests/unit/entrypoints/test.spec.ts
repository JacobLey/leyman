import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { context, describe, it, specify, suite, test, xdescribe, xit } from 'mocha-hookup';

const ranTests = new Set<number>();

suite('test', () => {

    test.skip('Suite types are consistent', () => {
        ranTests.add(-1);

        expectTypeOf(describe).toEqualTypeOf(mocha.describe);
        expectTypeOf(describe).toEqualTypeOf(suite);
        expectTypeOf(describe).toEqualTypeOf(mocha.suite);
        expectTypeOf(describe).toEqualTypeOf(context);
        expectTypeOf(xdescribe).toEqualTypeOf(describe.skip);
        expectTypeOf(xdescribe).toEqualTypeOf(mocha.xdescribe);

        throw new Error('<ERROR>');
    });

    xit(
        'Typed to prevent async + done', 
        // @ts-expect-error
        async (done) => {
            ranTests.add(-1);

            done();
        }
    );

    test(
        'Typed to prevent return + done',
        // @ts-expect-error 
        (done): number => {
            ranTests.add(1);

            setTimeout(() => {
                done();
            }, 5);
            return 0;
        }
    );

    test('Compare describe', async () => {
        ranTests.add(2);

        expect(describe).to.equal(mocha.describe);
        expect(describe).to.equal(suite);
        expect(describe).to.equal(mocha.suite);
        expect(describe).to.equal(context);
        expect(xdescribe).to.equal(describe.skip);
        expect(xdescribe).to.equal(mocha.xdescribe);
    });

    const tested = it('Compare tests', () => {
        ranTests.add(3);

        expect(it).to.equal(test);
        expect(it).to.equal(specify);
        expect(xit).to.equal(test.skip);
    });

    suite.skip('Skipped suite', () => {

        test('Test types are consistent', async () => {
            ranTests.add(-1);

            expectTypeOf(it).toEqualTypeOf(test);
            expectTypeOf(it).toEqualTypeOf(specify);
            expectTypeOf(xit).toEqualTypeOf(test.skip);

            expectTypeOf(tested).toEqualTypeOf<mocha.Test>();

            throw new Error('<ERROR>');
        });
    });

    suite('With retries', function() {

        this.retries(2);

        let shouldFailAsync = true;
        test('Async test fails first time', async () => {
            if (shouldFailAsync) {
                shouldFailAsync = false;
                throw new Error('<ERROR>');
            }
        });

        let shouldFailDone = true;
        test('Done test fails first time', (done) => {
            if (shouldFailDone) {
                shouldFailDone = false;
                throw new Error('<ERROR>');
            }
            done();
        });
    });

    mocha.after(() => {
        expect(ranTests).to.deep.equal(new Set([1, 2, 3]));
    });
});
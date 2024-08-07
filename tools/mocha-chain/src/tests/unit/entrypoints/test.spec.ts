import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { it, specify, suite, test, xit } from 'mocha-chain';

const ranTests = new Set<number>();

suite('test', () => {
    // @ts-expect-error
    xit('Typed to prevent async + done', async done => {
        ranTests.add(-1);

        done();
    });

    // @ts-expect-error
    test('Typed to prevent return + done', (done): number => {
        ranTests.add(1);

        setTimeout(() => {
            done();
        }, 5);
        return 0;
    });

    const tested = it('Compare tests', () => {
        ranTests.add(2);

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

    suite('With retries', function (this) {
        this.retries(2);

        let shouldFailAsync = true;
        test('Async test fails first time', async () => {
            if (shouldFailAsync) {
                shouldFailAsync = false;
                throw new Error('<ERROR>');
            }
        });

        let shouldFailDone = true;
        test('Done test fails first time', done => {
            if (shouldFailDone) {
                shouldFailDone = false;
                throw new Error('<ERROR>');
            }
            done();
        });
    });

    mocha.after(() => {
        expect(ranTests).to.deep.equal(new Set([1, 2]));
    });
});

import { expect } from 'chai';
import { before, suite } from 'mocha-hookup';
import { createSandbox, match, type SinonStub } from 'sinon';

suite('Pass mocks around in context', () => {

    const contextualBefore = before(async () => {
        return { 
            abc: 123,
            sandbox: createSandbox(),
        };
    })

    let count = 0;
    const contextualBeforeEach = contextualBefore.beforeEach(({ sandbox }) => {

        const mocked: SinonStub<number[], number> = sandbox.mock();

        return {
            count: count++,
            fakeAdder: sandbox.spy((...nums: number[]): number => {
                let sum = 0;
                for (const num of nums) {
                    sum += num;
                }
                return sum;
            }),
            mocked: mocked.withArgs(1, 2, 3).returns(4),
        };
    });

    suite('Test in a suite', () => {

        contextualBeforeEach.test('Returns sum of values', ctx => {

            expect(ctx.abc).to.equal(123);

            expect(ctx.fakeAdder(1, 2, 3, 4)).to.equal(10);
        });

        contextualBeforeEach.afterEach(async ctx => {

            expect(ctx.fakeAdder.calledWith(
                1,
                match(2),
                match(3),
                4,
            )).to.equal(true);

            expect(ctx.fakeAdder.calledWith(
                match(4),
                3,
                match(2),
                1,
            )).to.equal(false);
        });
    });

    contextualBeforeEach.it('Handles no parameters', async ctx => {
        expect(ctx.fakeAdder()).to.equal(0);
    });

    contextualBeforeEach.afterEach('Check if fake adder was called', async ({ fakeAdder, mocked, count }, done) => {

        expect(fakeAdder.callCount).to.equal(1);

        expect(mocked(1, 2, 3)).to.equal(4);

        done();
    });

    contextualBefore.afterEach(({ sandbox }) => {
        sandbox.verifyAndRestore();
    });
});
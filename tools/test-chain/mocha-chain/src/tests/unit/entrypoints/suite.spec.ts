import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as mocha from 'mocha';
import { suite, test } from 'mocha-chain';

suite('suite', () => {
    const suiteInstance = suite('Returns instance', () => {
        suite.skip('Skipped', () => {
            test('Never runs', () => {
                throw new Error('<ERROR>');
            });
        });

        test('Cannot invoke suite within test', () => {
            expect(() => {
                suite('Never runs', () => {});
            })
                .to.throw(Error)
                .that.contains({
                    message: 'Cannot create new hook/suite/test while executing a hook/test',
                });
        });

        // Native test, so mocha-chain's lock does not reject the suite first
        mocha.test('Cannot return promise from suite', () => {
            expect(() => {
                // @ts-expect-error
                suite('Never runs', async () => {});
            })
                .to.throw(Error)
                .that.contains({
                    message: 'Suite callback must be synchronous',
                });
        });
    });

    test('Suite instance is instance', () => {
        expectTypeOf(suiteInstance).toEqualTypeOf<mocha.Suite>();
        expect(suiteInstance).to.be.an.instanceOf(mocha.Suite);
        expect(suiteInstance.title).to.equal('Returns instance');
    });
});

import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { HookOrderError } from 'test-chain-core';
import { withoutContext } from '#internal/lib/wrappers.js';

suite('wrappers', () => {
    suite('withoutContext', () => {
        test('Strips leading context and preserves this', () => {
            const thisArg = { abc: 123 };
            const wrapped = withoutContext(function (this: unknown, ...args: unknown[]) {
                return [this, args];
            });

            expect(wrapped.call(thisArg, { ctx: true }, 1, 2)).to.deep.equal([thisArg, [1, 2]]);
        });

        test('Reports one more parameter than original', () => {
            expect(withoutContext(() => {}).length).to.equal(1);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            expect(withoutContext((_done: unknown) => {}).length).to.equal(2);
        });
    });

    suite('HookOrderError', () => {
        test('Describes the failure', () => {
            const error = new HookOrderError();
            expect(error).to.be.an.instanceOf(Error);
            expect(error.name).to.equal('HookOrderError');
            expect(error.message).to.contain(
                'Chained hook executed before the hook it is chained from'
            );
        });
    });
});

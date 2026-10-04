import { suite, test } from 'mocha';
import { assert, expect } from '@leyman/expect';

suite('expect', () => {
    test('Supports sync assertions', () => {
        expect(1).to.equal(1);
        assert.strictEqual(1, 1);
    });

    test('Supports promise assertions', async () => {
        const error = new Error('<ERROR>');
        const thrown: unknown = await expect(Promise.reject(error)).to.be.rejectedWith(Error);
        expect(thrown).to.equal(error);

        await assert.isRejected(Promise.reject(error), Error);
    });
});

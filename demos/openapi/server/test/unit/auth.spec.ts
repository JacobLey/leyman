import { staticTokens } from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('staticTokens', () => {
    test('Accepts every token listed', async () => {
        const authenticate = staticTokens(['a', 'b']);

        expect([await authenticate('a'), await authenticate('b')]).to.deep.equal([true, true]);
    });

    test('Rejects any other token', async () => {
        const authenticate = staticTokens(['a', 'b']);

        expect([
            await authenticate('c'),
            await authenticate('ab'),
            await authenticate(''),
        ]).to.deep.equal([false, false, false]);
    });

    test('Rejects every token when none is listed', async () => {
        expect(await staticTokens([])('a')).to.equal(false);
    });
});

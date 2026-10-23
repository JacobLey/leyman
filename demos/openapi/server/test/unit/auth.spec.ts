import { staticTokens } from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('staticTokens', () => {
    test('Accepts every token listed, with any scope', async () => {
        const authenticate = staticTokens(['a', 'b']);

        expect([
            await authenticate('a', ['notes:read']),
            await authenticate('b', ['notes:read', 'notes:write']),
        ]).to.deep.equal(['accepted', 'accepted']);
    });

    test('Rejects any other token', async () => {
        const authenticate = staticTokens(['a', 'b']);

        expect([
            await authenticate('c', []),
            await authenticate('ab', []),
            await authenticate('', []),
        ]).to.deep.equal(['invalid', 'invalid', 'invalid']);
    });

    test('Rejects every token when none is listed', async () => {
        expect(await staticTokens([])('a', [])).to.equal('invalid');
    });
});

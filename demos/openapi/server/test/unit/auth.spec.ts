import { staticTokens } from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const tokens = [
    { token: 'a', subject: 'alice' },
    { token: 'b', subject: 'bob' },
];

suite('staticTokens', () => {
    test('Accepts every token listed, with any scope, as its subject', async () => {
        const authenticate = staticTokens(tokens);

        expect([
            await authenticate('a', ['notes:read']),
            await authenticate('b', ['notes:read', 'notes:write']),
        ]).to.deep.equal([{ subject: 'alice' }, { subject: 'bob' }]);
    });

    test('Rejects any other token', async () => {
        const authenticate = staticTokens(tokens);

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

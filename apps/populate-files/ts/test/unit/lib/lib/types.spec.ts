import { suite, test } from 'mocha-chain';

suite('types', () => {
    test('coverage', async () => {
        await import('#internal/lib/lib/types.js');
    });
});

import { suite, test } from 'mocha-chain';

suite('types', () => {
    test('coverage', async () => {
        await Promise.all([import('#internal/lib/types.js'), import('#internal/generated/api.js')]);
    });
});

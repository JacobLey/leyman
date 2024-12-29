import { suite, test } from 'mocha-chain';

suite('types', () => {
    test('coverage', async () => {
        await import('../../../../commands/lib/types.js');
    });
});

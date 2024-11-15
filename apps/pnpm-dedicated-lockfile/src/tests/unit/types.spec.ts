import { suite, test } from 'npm-mocha-chain';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('../../commands/lib/types.js');
    });
});

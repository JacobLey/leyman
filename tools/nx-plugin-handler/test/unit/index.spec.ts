import { suite, test } from 'mocha-chain';

suite('nx-plugin-handler', () => {
    test('coverage', async () => {
        await import('nx-plugin-handler');
    });
});

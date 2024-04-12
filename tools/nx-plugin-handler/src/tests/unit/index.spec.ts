import { suite, test } from 'mocha-hookup';

suite('nx-plugin-handler', () => {
    test('coverage', async () => {
        await import('nx-plugin-handler');
    });
});

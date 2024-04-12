import { suite, test } from 'mocha-hookup';

suite('types', () => {
    test('coverage', async () => {
        await import('../../../lib/types.js');
    });
});

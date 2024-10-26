import { suite, test } from 'mocha';

suite('types', () => {
    test('coverage', async () => {
        await import('../../types.js');
    });
});

import { suite, test } from 'mocha';

suite('types', () => {
    test('coverage', async () => {
        await import('#internal/types.js');
    });
});

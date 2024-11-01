import { suite, test } from 'mocha-chain';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('../../commands/lib/types.js');
        await import('../data/commonjs/types.cjs');
    });
});

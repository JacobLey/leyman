import { suite, test } from 'mocha-chain';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('#test/data/commonjs/types.cjs');
    });
});

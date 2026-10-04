import { suite, test } from 'mocha-chain';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('#internal/executors/lifecycle/index.cjs');
    });
});

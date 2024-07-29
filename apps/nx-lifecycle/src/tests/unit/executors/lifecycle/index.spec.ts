import { suite, test } from 'mocha-chain';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('../../../../executors/lifecycle/index.cjs');
    });
});

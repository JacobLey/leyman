import { suite, test } from 'mocha-chain';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('../../../../executors/generate/index.cjs');
    });
});

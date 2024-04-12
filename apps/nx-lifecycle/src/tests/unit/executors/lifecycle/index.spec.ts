import { suite, test } from 'mocha-hookup';

suite('entrypoint', () => {
    test('coverage', async () => {
        await import('../../../../executors/lifecycle/index.cjs');
    });
});

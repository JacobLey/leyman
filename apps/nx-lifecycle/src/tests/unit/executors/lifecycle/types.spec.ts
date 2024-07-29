import { suite, test } from 'mocha-chain';

suite('types', () => {
    test('coverage', async () => {
        await import('../../../../executors/lifecycle/types.js');
    });
});

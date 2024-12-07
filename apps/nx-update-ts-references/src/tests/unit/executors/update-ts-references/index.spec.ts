import { suite, test } from 'mocha-chain';

suite('types', () => {
    test('coverage', async () => {
        await import('../../../../executors/update-ts-references/index.cjs');
    });
});

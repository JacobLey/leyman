import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('Type-only modules', () => {
    test('Load, for coverage of modules that compile to nothing', async () => {
        await expect(
            Promise.all([
                import('#internal/lib/schema/infer.js'),
                import('#internal/lib/schema/ir.js'),
                import('#internal/lib/standard-schema.js'),
            ])
        ).to.eventually.have.length(3);
    });
});

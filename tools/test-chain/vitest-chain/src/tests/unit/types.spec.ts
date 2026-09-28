import { describe, test } from 'vitest-chain';

describe('types', () => {
    test('coverage', async () => {
        await import('../../lib/types.js');
    });
});

import { describe, test } from 'vitest-chain';

describe('types', () => {
    test('coverage', async () => {
        await import('#internal/lib/types.js');
    });
});

import { beforeAll, beforeEach, describe, test } from 'vitest-chain';

describe('types', () => {
    test('coverage', async () => {
        await import('#internal/lib/types.js');
    });

    // Skipped on purpose: only checks types, as hooks can't be declared inside a test
    test.skip('Hooks must return a plain object', () => {
        // @ts-expect-error
        beforeAll(() => [1]);
        // @ts-expect-error
        beforeEach(async () => new Map<string, number>());
        // @ts-expect-error
        beforeAll(() => ({ a: 1 })).afterAll(() => () => 1);
        // @ts-expect-error
        beforeEach(() => ({ a: 1 })).beforeEach(async () => new Set<number>());

        beforeAll(() => ({ fn: () => 1 })).beforeAll(async () => {});
        beforeEach(() => (Math.random() > 0.5 ? { a: 1 } : undefined));
    });
});

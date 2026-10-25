import { before, beforeEach, suite, test } from 'mocha-chain';

suite('types', () => {
    test('coverage', async () => {
        await import('#internal/lib/types.js');
    });

    // Skipped on purpose: only checks types, as hooks can't be declared inside a test
    test.skip('Hooks must return a plain object', () => {
        // @ts-expect-error
        before(() => [1]);
        // @ts-expect-error
        beforeEach(async () => new Map<string, number>());
        // @ts-expect-error
        before(() => ({ a: 1 })).after(() => () => 1);
        // @ts-expect-error
        beforeEach(() => ({ a: 1 })).beforeEach(async () => new Set<number>());

        before(() => ({ fn: () => 1 })).before(async () => {});
        beforeEach(() => (Math.random() > 0.5 ? { a: 1 } : undefined));
    });
});

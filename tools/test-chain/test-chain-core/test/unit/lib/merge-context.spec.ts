import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { mergeContexts } from '#internal/lib/merge-context.js';

suite('mergeContexts', () => {
    test('Ignores falsy additional context', async () => {
        const existing = { a: 1 };
        for (const additional of [undefined, null]) {
            expect(await mergeContexts(existing, additional)).to.equal(existing);
        }
    });

    test('Merges additional context over existing', async () => {
        expect(await mergeContexts({ a: 1, b: 2 }, { b: 3, c: 4 })).to.deep.equal({
            a: 1,
            b: 3,
            c: 4,
        });
    });

    test('Accepts promises', async () => {
        expect(
            await mergeContexts(Promise.resolve({ a: 1 }), Promise.resolve({ b: 2 }))
        ).to.deep.equal({ a: 1, b: 2 });
    });
});

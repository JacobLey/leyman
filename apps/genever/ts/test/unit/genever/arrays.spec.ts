import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../../lib/expect-generated.js';

suite('arrays', () => {
    test('items', () => {
        expectGenerated({ type: 'array', items: { type: 'string' } }, { Schema: 'string[]' });
    });

    test('no items', () => {
        expectGenerated({ type: 'array', uniqueItems: true }, { Schema: 'unknown[]' });
    });

    test('items false is an empty tuple', () => {
        expectGenerated({ type: 'array', items: false }, { Schema: '[]' });
    });

    test('union items', () => {
        expectGenerated(
            { type: 'array', items: { type: ['string', 'number'] } },
            { Schema: '(string | number)[]' }
        );
    });

    suite('minItems', () => {
        test('requires that many items', () => {
            expectGenerated(
                { type: 'array', items: { type: 'string' }, minItems: 1 },
                { Schema: '[string, ...string[]]' }
            );
        });

        test('up to 3', () => {
            expectGenerated(
                { type: 'array', items: { type: 'string' }, minItems: 3 },
                { Schema: '[string, string, string, ...string[]]' }
            );
        });

        test('beyond 3 is a plain array', () => {
            expectGenerated(
                { type: 'array', items: { type: 'string' }, minItems: 4 },
                { Schema: 'string[]' }
            );
        });

        test('without items', () => {
            expectGenerated({ type: 'array', minItems: 1 }, { Schema: '[unknown, ...unknown[]]' });
        });

        test('after prefix items', () => {
            expectGenerated(
                {
                    type: 'array',
                    prefixItems: [{ type: 'number' }],
                    items: { type: 'string' },
                    minItems: 2,
                },
                { Schema: '[number, string, ...string[]]' }
            );
        });

        test('typedMinItems 0 turns it off', () => {
            expectGenerated(
                { type: 'array', items: { type: 'string' }, minItems: 1 },
                { Schema: 'string[]' },
                { typedMinItems: 0 }
            );
        });

        test('typedMinItems raises the cap', () => {
            expectGenerated(
                { type: 'array', items: { type: 'string' }, minItems: 4 },
                { Schema: '[string, string, string, string, ...string[]]' },
                { typedMinItems: 4 }
            );
        });
    });

    suite('tuples', () => {
        test('prefixItems with items false', () => {
            expectGenerated(
                {
                    type: 'array',
                    prefixItems: [{ type: 'string' }, { type: 'number' }],
                    items: false,
                    minItems: 2,
                },
                { Schema: '[string, number]' }
            );
        });

        test('prefixItems with items', () => {
            expectGenerated(
                {
                    type: 'array',
                    prefixItems: [{ type: 'string' }],
                    items: { type: 'boolean' },
                    minItems: 1,
                },
                { Schema: '[string, ...boolean[]]' }
            );
        });

        test('prefixItems without items', () => {
            expectGenerated(
                { type: 'array', prefixItems: [{ type: 'string' }], minItems: 1 },
                { Schema: '[string, ...unknown[]]' }
            );
        });

        test('items beyond minItems are optional', () => {
            expectGenerated(
                {
                    type: 'array',
                    prefixItems: [{ type: 'string' }, { type: ['number', 'null'] }],
                    items: false,
                    minItems: 1,
                },
                { Schema: '[string, (number | null)?]' }
            );
        });

        test('items array with additionalItems (draft 7)', () => {
            expectGenerated(
                {
                    type: 'array',
                    items: [{ type: 'string' }, { type: 'number' }],
                    additionalItems: { type: 'null' },
                    minItems: 2,
                },
                { Schema: '[string, number, ...null[]]' }
            );
        });

        test('items array without additionalItems (draft 7)', () => {
            expectGenerated(
                { type: 'array', items: [{ type: 'string' }], minItems: 1 },
                { Schema: '[string, ...unknown[]]' }
            );
        });
    });
});

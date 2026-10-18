import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';

suite('options', () => {
    suite('openApi30', () => {
        test('nullable', () => {
            expectDecanted(
                { type: 'string', nullable: true, example: 'abc' },
                { Schema: 'string | null' },
                { openApi30: true }
            );
        });

        test('not nullable', () => {
            expectDecanted(
                { type: 'string', nullable: false },
                { Schema: 'string' },
                { openApi30: true }
            );
        });
    });

    suite('strict disabled', () => {
        test('infers the type from keywords', () => {
            expectDecanted(
                { properties: { a: { type: 'string' } }, required: ['a'] },
                { Schema: '{ a: string }' },
                { strict: false }
            );
        });

        test('infers every type with keywords', () => {
            expectDecanted(
                { minLength: 1, items: { type: 'number' } },
                { Schema: 'string | number[]' },
                { strict: false }
            );
        });

        test('ignores unknown keywords', () => {
            expectDecanted(
                { type: 'string', foo: 1, nullable: true },
                { Schema: 'string' },
                { strict: false }
            );
        });

        test('ignores keywords of other types', () => {
            expectDecanted({ type: 'string', minimum: 1 }, { Schema: 'string' }, { strict: false });
        });

        test('ignores then without if', () => {
            expectDecanted(
                // eslint-disable-next-line unicorn/no-thenable
                { type: 'string', then: { type: 'number' } },
                { Schema: 'string' },
                { strict: false }
            );
        });
    });
});

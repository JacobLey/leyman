/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { expectDecanted } from '../../lib/expect-decanted.js';

suite('primitives', () => {
    test('detects a mismatched type', () => {
        expect(() => {
            expectDecanted({ type: 'string' }, { Schema: 'number' });
        }).to.throw(Error);
    });

    test('detects a missing optional property', () => {
        expect(() => {
            expectDecanted({ type: 'object', properties: { a: true } }, { Schema: '{}' });
        }).to.throw(Error);
    });

    suite('type', () => {
        test('string', () => {
            expectDecanted({ type: 'string' }, { Schema: 'string' });
        });

        test('number', () => {
            expectDecanted({ type: 'number' }, { Schema: 'number' });
        });

        test('integer', () => {
            expectDecanted({ type: 'integer', minimum: 0 }, { Schema: 'number' });
        });

        test('boolean', () => {
            expectDecanted({ type: 'boolean' }, { Schema: 'boolean' });
        });

        test('null', () => {
            expectDecanted({ type: 'null' }, { Schema: 'null' });
        });

        test('array of types', () => {
            expectDecanted({ type: ['string', 'null'] }, { Schema: 'string | null' });
        });

        test('integer and number', () => {
            expectDecanted({ type: ['integer', 'number'] }, { Schema: 'number' });
        });
    });

    suite('boolean schemas', () => {
        test('true is unknown', () => {
            expectDecanted(true, { Schema: 'unknown' });
        });

        test('false is never', () => {
            expectDecanted(false, { Schema: 'never' });
        });

        test('empty schema is unknown', () => {
            expectDecanted({ description: 'Anything' }, { Schema: 'unknown' });
        });
    });

    suite('pattern', () => {
        test('starts with', () => {
            expectDecanted({ type: 'string', pattern: '^abc' }, { Schema: '`abc${string}`' });
        });

        test('ends with', () => {
            expectDecanted({ type: 'string', pattern: 'abc$' }, { Schema: '`${string}abc`' });
        });

        test('contains', () => {
            expectDecanted(
                { type: 'string', pattern: 'abc' },
                { Schema: '`${string}abc${string}`' }
            );
        });

        test('exact', () => {
            expectDecanted({ type: 'string', pattern: '^abc$' }, { Schema: '"abc"' });
        });

        test('escaped characters', () => {
            expectDecanted(
                { type: 'string', pattern: String.raw`^a\.b\x2dc\$` },
                { Schema: '`a.b-c$${string}`' }
            );
        });

        test('template literal characters', () => {
            expectDecanted(
                // Regular expression for the literal text: ${x}\`
                { type: 'string', pattern: [String.raw`^\$\{x\}\\`, '`'].join('') },
                { Schema: '`\\${x}\\\\\\`${string}`' }
            );
        });

        test('character class is any string', () => {
            expectDecanted({ type: 'string', pattern: String.raw`^\d+` }, { Schema: 'string' });
        });

        test('unescaped special character is any string', () => {
            expectDecanted({ type: 'string', pattern: '^a.c' }, { Schema: 'string' });
        });

        test('unicode escape is any string', () => {
            expectDecanted({ type: 'string', pattern: String.raw`^\u0041` }, { Schema: 'string' });
        });

        test('anchors alone are any string', () => {
            expectDecanted({ type: 'string', pattern: '^$' }, { Schema: 'string' });
        });
    });

    suite('enum and const', () => {
        test('enum', () => {
            expectDecanted({ enum: ['a', 1, true, null] }, { Schema: '"a" | 1 | true | null' });
        });

        test('object and array values', () => {
            expectDecanted({ enum: [{ a: [1, 'b'] }, []] }, { Schema: '{ a: [1, "b"] } | []' });
        });

        test('empty enum is never', () => {
            expectDecanted({ enum: [] }, { Schema: 'never' });
        });

        test('values not of the type are dropped', () => {
            expectDecanted({ type: 'string', enum: ['a', 1, null] }, { Schema: '"a"' });
        });

        test('many values', () => {
            const values = Array.from({ length: 50 }, (_, i) => `v${i}`);
            expectDecanted(
                { type: 'string', enum: values },
                { Schema: values.map(value => JSON.stringify(value)).join(' | ') }
            );
        });

        test('const', () => {
            expectDecanted({ const: 'a' }, { Schema: '"a"' });
        });

        test('const null', () => {
            expectDecanted({ const: null }, { Schema: 'null' });
        });

        test('const and enum', () => {
            expectDecanted({ const: 'a', enum: ['a', 'b'] }, { Schema: '"a"' });
        });
    });
});

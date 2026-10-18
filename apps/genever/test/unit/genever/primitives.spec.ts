/* eslint-disable no-template-curly-in-string -- expected types are TypeScript source, with template literal types */
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../../lib/expect-generated.js';

suite('primitives', () => {
    test('detects a mismatched type', () => {
        expect(() => {
            expectGenerated({ type: 'string' }, { Schema: 'number' });
        }).to.throw(Error);
    });

    test('detects a missing optional property', () => {
        expect(() => {
            expectGenerated({ type: 'object', properties: { a: true } }, { Schema: '{}' });
        }).to.throw(Error);
    });

    suite('type', () => {
        test('string', () => {
            expectGenerated({ type: 'string' }, { Schema: 'string' });
        });

        test('number', () => {
            expectGenerated({ type: 'number' }, { Schema: 'number' });
        });

        test('integer', () => {
            expectGenerated({ type: 'integer', minimum: 0 }, { Schema: 'number' });
        });

        test('bounds that allow values', () => {
            expectGenerated(
                {
                    type: ['number', 'integer'],
                    minimum: 1,
                    exclusiveMinimum: 1,
                    maximum: 4,
                    exclusiveMaximum: 3,
                },
                { Schema: 'number' }
            );
        });

        test('inclusive bounds of one value', () => {
            expectGenerated({ type: 'number', minimum: 2, maximum: 2 }, { Schema: 'number' });
        });

        test('looser bounds are ignored', () => {
            expectGenerated(
                {
                    type: 'integer',
                    exclusiveMinimum: 0,
                    minimum: 1,
                    maximum: 5,
                    exclusiveMaximum: 9,
                },
                { Schema: 'number' }
            );
        });

        test('boolean', () => {
            expectGenerated({ type: 'boolean' }, { Schema: 'boolean' });
        });

        test('null', () => {
            expectGenerated({ type: 'null' }, { Schema: 'null' });
        });

        test('array of types', () => {
            expectGenerated({ type: ['string', 'null'] }, { Schema: 'string | null' });
        });

        test('integer and number', () => {
            expectGenerated({ type: ['integer', 'number'] }, { Schema: 'number' });
        });
    });

    suite('boolean schemas', () => {
        test('true is unknown', () => {
            expectGenerated(true, { Schema: 'unknown' });
        });

        test('false is never', () => {
            expectGenerated(false, { Schema: 'never' });
        });

        test('empty schema is unknown', () => {
            expectGenerated({ description: 'Anything' }, { Schema: 'unknown' });
        });
    });

    suite('pattern', () => {
        test('starts with', () => {
            expectGenerated({ type: 'string', pattern: '^abc' }, { Schema: '`abc${string}`' });
        });

        test('ends with', () => {
            expectGenerated({ type: 'string', pattern: 'abc$' }, { Schema: '`${string}abc`' });
        });

        test('contains', () => {
            expectGenerated(
                { type: 'string', pattern: 'abc' },
                { Schema: '`${string}abc${string}`' }
            );
        });

        test('exact', () => {
            expectGenerated({ type: 'string', pattern: '^abc$' }, { Schema: '"abc"' });
        });

        test('escaped characters', () => {
            expectGenerated(
                { type: 'string', pattern: String.raw`^a\.b\x2dc\$` },
                { Schema: '`a.b-c$${string}`' }
            );
        });

        test('template literal characters', () => {
            expectGenerated(
                // Regular expression for the literal text: ${x}\`
                { type: 'string', pattern: [String.raw`^\$\{x\}\\`, '`'].join('') },
                { Schema: '`\\${x}\\\\\\`${string}`' }
            );
        });

        test('character class is any string', () => {
            expectGenerated({ type: 'string', pattern: String.raw`^\d+` }, { Schema: 'string' });
        });

        test('unescaped special character is any string', () => {
            expectGenerated({ type: 'string', pattern: '^a.c' }, { Schema: 'string' });
        });

        test('unicode escape is any string', () => {
            expectGenerated({ type: 'string', pattern: String.raw`^\u0041` }, { Schema: 'string' });
        });

        test('anchors alone are any string', () => {
            expectGenerated({ type: 'string', pattern: '^$' }, { Schema: 'string' });
        });
    });

    suite('enum and const', () => {
        test('enum', () => {
            expectGenerated({ enum: ['a', 1, true, null] }, { Schema: '"a" | 1 | true | null' });
        });

        test('object and array values', () => {
            expectGenerated({ enum: [{ a: [1, 'b'] }, []] }, { Schema: '{ a: [1, "b"] } | []' });
        });

        test('values of the declared type', () => {
            expectGenerated(
                { type: ['array', 'object', 'boolean'], enum: [[1], { a: null }, false] },
                { Schema: '[1] | { a: null } | false' }
            );
        });

        test('empty enum is never', () => {
            expectGenerated({ enum: [] }, { Schema: 'never' });
        });

        test('many values', () => {
            const values = Array.from({ length: 50 }, (_, i) => `v${i}`);
            expectGenerated(
                { type: 'string', enum: values },
                { Schema: values.map(value => JSON.stringify(value)).join(' | ') }
            );
        });

        test('const', () => {
            expectGenerated({ const: 'a' }, { Schema: '"a"' });
        });

        test('const null', () => {
            expectGenerated({ const: null }, { Schema: 'null' });
        });

        test('const and enum', () => {
            expectGenerated({ const: 'a', enum: ['a', 'b'] }, { Schema: '"a"' });
        });
    });
});

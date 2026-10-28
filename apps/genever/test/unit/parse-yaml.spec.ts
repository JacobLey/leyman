import { YAMLError } from 'yaml';
import { expect } from '@leyman/expect';
import { GeneverInvalidSchemaError, parseYaml } from 'genever';
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../lib/expect-generated.js';

suite('parseYaml', () => {
    test('parses YAML', () => {
        expect(parseYaml('type: array\nitems: { type: string }\n')).to.deep.equal({
            type: 'array',
            items: { type: 'string' },
        });
    });

    test('parses JSON', () => {
        expect(parseYaml('{ "type": "string", "enum": ["on"] }')).to.deep.equal({
            type: 'string',
            enum: ['on'],
        });
    });

    test('a recursive alias becomes a $ref', () => {
        expectGenerated(
            parseYaml(
                '&node\ntype: object\nproperties:\n  children: { type: array, items: *node }\n'
            ),
            { Schema: '{ children?: Schema[] }' }
        );
    });

    test("rejects what JSON can't hold", () => {
        expect(() => parseYaml('a: 1\na: 2\n')).to.throw(YAMLError);
        expect(() => parseYaml('const: .inf\n')).to.throw(GeneverInvalidSchemaError);
    });
});

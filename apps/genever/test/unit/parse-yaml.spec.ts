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

    test('rejects an alias with no anchor before it', () => {
        for (const [text, start, line] of [
            ['type: object\nproperties:\n  a: *b\n', 30, 3],
            ['$defs:\n  a: *b\n  b: &b { type: string }\n', 12, 2],
        ] as const) {
            expect(() => parseYaml(text))
                .to.throw(
                    YAMLError,
                    `Alias *b has no anchor &b before it at line ${line}, column 6`
                )
                .with.property('pos')
                .that.deep.equals([start, start + 2]);
        }
    });

    test('rejects a merge key that merges a map into itself', () => {
        for (const [text, name, start, line, column] of [
            ['properties: &p\n  a: { type: string }\n  <<: *p\n', 'p', 43, 3, 7],
            ['a: &a\n  b: { <<: [{ c: 1 }, *a] }\n', 'a', 28, 2, 23],
        ] as const) {
            expect(() => parseYaml(text))
                .to.throw(
                    YAMLError,
                    `Merge key's alias *${name} is inside the map &${name} it merges at line ${line}, column ${column}`
                )
                .with.property('pos')
                .that.deep.equals([start, start + 2]);
        }
    });

    test('merges an earlier map, and keeps a quoted "<<" key', () => {
        expect(parseYaml('a: &a { b: 1 }\nc: { <<: *a }\nd: { "<<": 2 }\n')).to.deep.equal({
            a: { b: 1 },
            c: { b: 1 },
            d: { '<<': 2 },
        });
    });
});

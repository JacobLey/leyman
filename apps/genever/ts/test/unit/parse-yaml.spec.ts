import { YAMLError } from 'yaml';
import { expect } from '@leyman/expect';
import { GeneverInvalidSchemaError, parseYaml, parseYamlDocument, yamlToJson } from 'genever';
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '#test/lib/expect-generated.js';

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

    test('rejects a merge key of anything but maps', () => {
        for (const [text, start, length, line, column] of [
            ['a: { <<: 1 }\n', 9, 1, 1, 10],
            ['a: { <<: [{ b: 1 }, 2] }\n', 20, 1, 1, 21],
            ['a: { <<: [[{ b: 1 }]] }\n', 10, 10, 1, 11],
            ['n: &n 1\na: { <<: *n }\n', 17, 2, 2, 10],
            ['n: &n 1\na: { <<: [*n] }\n', 18, 2, 2, 11],
            ['s: &s [1]\na: { <<: *s }\n', 7, 1, 1, 8],
            ['? <<\n', 2, 2, 1, 3],
        ] as const) {
            expect(() => parseYaml(text), text)
                .to.throw(
                    YAMLError,
                    `Merge key can only merge a map or a sequence of maps at line ${line}, column ${column}`
                )
                .with.property('pos')
                .that.deep.equals([start, start + length]);
        }
    });

    test('rejects a merge key of a null, at the empty value', () => {
        expect(() => parseYaml('a: { <<: }\n')).to.throw(YAMLError, 'Merge key can only merge');
        expect(() => parseYaml('a:\n  <<:\n')).to.throw(YAMLError, 'Merge key can only merge');
    });

    test('rejects a merge key whose alias has no anchor, as that', () => {
        for (const text of ['a: { <<: *x }\n', 'a: { <<: [*x] }\n']) {
            expect(() => parseYaml(text), text).to.throw(
                YAMLError,
                'Alias *x has no anchor &x before it'
            );
        }
    });

    test('rejects a merge key of a sequence holding the map it merges', () => {
        expect(() => parseYaml('a: &a [{ <<: *a }]\n')).to.throw(
            YAMLError,
            "Merge key's alias *a is inside the map &a it merges"
        );
        expect(() => parseYaml('a: &a { b: &s [*a], <<: *s }\n')).to.throw(
            YAMLError,
            "Merge key's alias *a is inside the map &a it merges"
        );
    });

    test('merges a sequence, an alias of one, and aliases in one', () => {
        expect(
            parseYaml(
                'm: &m { b: 1 }\ns: &s [*m, { c: 2 }]\nd: { <<: *s }\ne: { <<: [*m, { f: 3 }] }\ng: { <<: [] }\n'
            )
        ).to.deep.equal({
            m: { b: 1 },
            s: [{ b: 1 }, { c: 2 }],
            d: { b: 1, c: 2 },
            e: { b: 1, f: 3 },
            g: {},
        });
    });

    test('merges an earlier map, and keeps a quoted "<<" key', () => {
        expect(parseYaml('a: &a { b: 1 }\nc: { <<: *a }\nd: { "<<": 2 }\n')).to.deep.equal({
            a: { b: 1 },
            c: { b: 1 },
            d: { '<<': 2 },
        });
    });
});

suite('parseYamlDocument and yamlToJson', () => {
    test('Together are parseYaml', () => {
        const text = 'a: &a { b: 1 }\nc: { <<: *a }\n';

        expect(yamlToJson(parseYamlDocument(text))).to.deep.equal(parseYaml(text));
    });

    test('The document has where each node is', () => {
        const text = 'type: string\n';
        const { contents } = parseYamlDocument(text);

        expect(contents?.range?.[0]).to.equal(0);
    });

    test('Syntax errors are from parseYamlDocument', () => {
        expect(() => parseYamlDocument('a: 1\na: 2\n')).to.throw(YAMLError);
    });

    test('Values JSON does not have are from yamlToJson', () => {
        const document = parseYamlDocument('const: .inf\n');

        expect(() => yamlToJson(document)).to.throw(GeneverInvalidSchemaError);
    });
});

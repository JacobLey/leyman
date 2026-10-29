import { expect } from '@leyman/expect';
import { genever, parseYaml } from 'genever';
import { diagnosticCodes, mapDocument } from 'genever-content-mapper';
import { suite, test } from 'mocha-chain';

const fileName = '/project/user.schema.yaml';

/**
 * Map a document that has one error, and return the text the error's range covers.
 *
 * @param text - document text
 * @returns the diagnostic's code and message, and the text it covers
 */
const mapError = (text: string): { code: number; messageText: string; covers: string } => {
    const mapped = mapDocument(text, fileName);
    expect(mapped.text).to.equal('export {};\n');
    expect(mapped.diagnostics).to.have.length(1);
    const [{ code, messageText, start, length }] = mapped.diagnostics as [
        (typeof mapped.diagnostics)[number],
    ];
    return { code, messageText, covers: text.slice(start, start + length) };
};

suite('mapDocument', () => {
    suite('types', () => {
        test("genever's types for the document", () => {
            const text = 'type: object\nrequired: [id]\nproperties:\n  id: { type: string }\n';
            const types = genever(parseYaml(text));

            expect(mapDocument(text, fileName)).to.deep.equal({
                text: types,
                diagnostics: [],
                mappings: [[types.indexOf('id:'), 2, text.indexOf('id:'), 2, 2]],
            });
        });

        test('JSON is YAML too', () => {
            const text = '{ "type": "array", "items": { "type": "string" } }';

            expect(mapDocument(text, fileName).text).to.equal(genever(parseYaml(text)));
        });

        test('with options', () => {
            const text = 'type: array\nitems: { type: string }\nminItems: 1\n';
            const options = { name: 'Tags', typedMinItems: 0 };

            expect(mapDocument(text, fileName, options).text).to.equal(
                genever(parseYaml(text), options)
            );
        });

        test('an OpenAPI document', () => {
            const text = [
                'openapi: 3.1.0',
                'info: { title: Notes, version: "1" }',
                'paths: {}',
                'components:',
                '  schemas:',
                '    Note: { type: object, properties: { body: { type: string } } }',
                '',
            ].join('\n');

            expect(mapDocument(text, fileName).text).to.equal(genever(parseYaml(text)));
        });

        test('$ids resolve against the file', () => {
            const text = [
                '$id: user.schema.yaml',
                '$ref: "#/$defs/Id"',
                '$defs:',
                '  Id: { type: string }',
                '',
            ].join('\n');

            expect(mapDocument(text, fileName).diagnostics).to.deep.equal([]);
        });
    });

    suite('mappings', () => {
        /**
         * Each mapping, as the name in the types and the text of the document it maps to.
         *
         * @param text - the document's contents
         * @returns name and document text of each mapping
         */
        const mapped = (text: string): { kind: number; name: string; original: string }[] => {
            const { mappings, text: types } = mapDocument(text, fileName);
            return mappings.map(
                ([virtualStart, virtualLength, originalStart, originalLength, kind]) => ({
                    kind,
                    name: types.slice(virtualStart, virtualStart + virtualLength),
                    original: text.slice(originalStart, originalStart + originalLength),
                })
            );
        };

        test("each definition's and property's name to its key, not the root's", () => {
            expect(
                mapped(
                    [
                        'type: object',
                        'properties:',
                        '  note: { $ref: "#/$defs/Note" }',
                        '  tags: { $ref: "#/properties/list" }',
                        '  list: { type: array, items: { type: string } }',
                        '$defs:',
                        '  Note: { type: string }',
                        '',
                    ].join('\n')
                )
            ).to.deep.equal([
                { kind: 2, name: 'note', original: 'note' },
                { kind: 2, name: 'tags', original: 'tags' },
                { kind: 2, name: 'list', original: 'list' },
                { kind: 2, name: 'Note', original: 'Note' },
                { kind: 2, name: 'PropertiesList', original: 'list' },
            ]);
        });

        test("a component's properties, quoted or not, to their keys", () => {
            expect(
                mapped(
                    [
                        'openapi: 3.1.0',
                        'info: { title: Notes, version: "1" }',
                        'paths: {}',
                        'components:',
                        '  schemas:',
                        '    Note:',
                        '      type: object',
                        '      properties:',
                        '        body: { type: string }',
                        '        "created at": { type: string }',
                        '',
                    ].join('\n')
                )
            ).to.deep.equal([
                { kind: 2, name: 'Note', original: 'Note' },
                { kind: 2, name: 'body', original: 'body' },
                { kind: 2, name: '"created at"', original: '"created at"' },
                { kind: 2, name: 'Paths', original: 'paths' },
            ]);
        });

        test("each component's name, and Paths, to its key", () => {
            expect(
                mapped(
                    [
                        'openapi: 3.1.0',
                        'info: { title: Notes, version: "1" }',
                        'paths:',
                        '  /notes:',
                        '    get:',
                        '      operationId: listNotes',
                        '      responses: { "204": { description: None } }',
                        'components:',
                        '  schemas:',
                        '    "A note": { type: string }',
                        '',
                    ].join('\n')
                )
            ).to.deep.equal([
                { kind: 2, name: 'ANote', original: '"A note"' },
                { kind: 2, name: 'Paths', original: 'paths' },
            ]);
        });

        test('a key reached through an alias, at its anchor', () => {
            expect(
                mapped('$defs:\n  Base: &base { type: string }\n  Other: *base\n')
            ).to.deep.equal([
                { kind: 2, name: 'Base', original: 'Base' },
                { kind: 2, name: 'Other', original: 'Other' },
            ]);
        });
    });

    suite('errors', () => {
        test('YAML syntax', () => {
            expect(mapError('a: [\n')).to.include({ code: diagnosticCodes.syntax, covers: '' });
        });

        test('an alias with no anchor before it covers the alias', () => {
            expect(mapError('type: object\nproperties:\n  a: *b\n')).to.include({
                code: diagnosticCodes.syntax,
                covers: '*b',
            });
        });

        test('a value JSON has no equivalent for', () => {
            expect(mapError('const: .inf\n')).to.deep.equal({
                code: diagnosticCodes.invalidSchema,
                messageText: 'YAML number Infinity has no JSON equivalent (at #/const)',
                covers: 'const: .inf',
            });
        });

        test('not a schema covers the whole document', () => {
            expect(mapError('- 1\n- 2\n')).to.deep.equal({
                code: diagnosticCodes.invalidSchema,
                messageText: 'Must be an object (at #)',
                covers: '- 1\n- 2\n',
            });
        });

        test('a strict mode error covers its keyword and value', () => {
            expect(
                mapError('type: object\nproperties:\n  id: { type: string, minLenght: 1 }\n')
            ).to.deep.equal({
                code: diagnosticCodes.strictMode,
                messageText: 'Unknown keyword "minLenght" (at #/properties/id/minLenght)',
                covers: 'minLenght: 1',
            });
        });

        test('a $ref to another file is unsupported', () => {
            expect(
                mapError('type: object\nproperties:\n  other: { $ref: ./other.yaml }\n')
            ).to.include({
                code: diagnosticCodes.unsupported,
                covers: '$ref: ./other.yaml',
            });
        });

        test('a $ref to a URL is unsupported', () => {
            expect(
                mapError(
                    'type: object\nproperties:\n  other: { $ref: "https://example.com/a.json" }\n'
                )
            ).to.include({
                code: diagnosticCodes.unsupported,
                covers: '$ref: "https://example.com/a.json"',
            });
        });

        test('in an array', () => {
            expect(mapError('allOf:\n  - { type: string, bogus: 1 }\n')).to.include({
                covers: 'bogus: 1',
            });
        });

        test('a key with a / in an OpenAPI document', () => {
            const text = [
                'openapi: 3.1.0',
                'info: { title: Notes, version: "1" }',
                'paths:',
                '  /notes:',
                '    get:',
                '      responses:',
                '        "200":',
                '          description: ok',
                '          content:',
                '            application/json: { schema: { type: string, bogus: 1 } }',
                '',
            ].join('\n');

            expect(mapError(text)).to.include({ covers: 'bogus: 1' });
        });

        test('through an alias, at its anchor', () => {
            expect(
                mapError(
                    'type: object\n$defs:\n  base: &b { type: string, bogus: 1 }\nproperties:\n  y: *b\n'
                )
            ).to.include({ covers: 'bogus: 1' });
        });

        test('through a merge key, at the nearest entry', () => {
            expect(
                mapError('type: object\nproperties:\n  y: { <<: { type: string, bogus: 1 } }\n')
            ).to.include({ covers: 'y: { <<: { type: string, bogus: 1 } }' });
        });

        test('a key without a value', () => {
            expect(mapError('type: object\nproperties:\n  a:\n')).to.include({ covers: 'a:' });
        });

        test('an explicit key without a value', () => {
            expect(mapError('type: object\nproperties:\n  ? a\n')).to.include({ covers: 'a' });
        });

        test('an empty document', () => {
            expect(mapError('')).to.include({ code: diagnosticCodes.invalidSchema });
        });

        test('anything else, at the start of the document', () => {
            const options = {
                get strict(): boolean {
                    throw new TypeError('Unexpected');
                },
            };

            expect(mapDocument('type: string\n', fileName, options)).to.deep.equal({
                text: 'export {};\n',
                diagnostics: [
                    {
                        code: diagnosticCodes.unexpected,
                        messageText: 'TypeError: Unexpected',
                        start: 0,
                        length: 0,
                    },
                ],
                mappings: [],
            });
        });
    });
});

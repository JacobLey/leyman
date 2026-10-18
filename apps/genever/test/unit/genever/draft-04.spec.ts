import { expect } from '@leyman/expect';
import { genever, GeneverInvalidSchemaError, GeneverStrictModeError } from 'genever';
import { suite, test } from 'mocha-chain';
import { expectGenerated } from '../../lib/expect-generated.js';

// eslint-disable-next-line unicorn/prefer-https -- draft-04's own $schema is http
const draft04 = 'http://json-schema.org/draft-04/schema#';

suite('draft-04', () => {
    test('id names an embedded resource', () => {
        expectGenerated(
            {
                $schema: draft04,
                type: 'object',
                properties: { item: { $ref: 'https://example.test/item' } },
                definitions: { Item: { id: 'https://example.test/item', type: 'string' } },
            },
            { Schema: '{ item?: Item }', Item: 'string' }
        );
    });

    test('a root id is the base URI', () => {
        expectGenerated(
            {
                $schema: draft04,
                id: 'https://example.test/schemas/root.json',
                type: 'object',
                properties: { a: { $ref: 'root.json#/definitions/A' } },
                definitions: { A: { type: 'string' } },
            },
            { Schema: '{ a?: A }', A: 'string' }
        );
    });

    test('an id of a fragment is an anchor', () => {
        expectGenerated(
            {
                $schema: draft04,
                type: 'object',
                properties: { a: { $ref: '#thing' } },
                definitions: { Thing: { id: '#thing', type: 'number' } },
            },
            { Schema: '{ a?: Thing }', Thing: 'number' }
        );
    });

    test('a draft-04 schema inside a 2020-12 one', () => {
        expectGenerated(
            {
                type: 'object',
                properties: { item: { $ref: 'https://example.test/item' } },
                $defs: {
                    Legacy: {
                        $schema: draft04,
                        definitions: {
                            Item: { id: 'https://example.test/item', type: 'string' },
                        },
                    },
                },
            },
            { Schema: '{ item?: Item }', Item: 'string' }
        );
    });

    test('an invalid id', () => {
        expect(() => genever({ $schema: draft04, definitions: { A: { id: 'a#b' } } }))
            .to.throw(GeneverInvalidSchemaError, /id must be a URI/u)
            .with.property('pointer', '#/definitions/A/id');
    });

    test('boolean exclusive bounds', () => {
        expectGenerated(
            {
                $schema: draft04,
                type: 'number',
                minimum: 1,
                maximum: 1,
                exclusiveMaximum: true,
            },
            { Schema: 'never' },
            { strict: false }
        );
    });

    suite('outside draft-04', () => {
        test('id is an unknown keyword', () => {
            expect(() => genever({ type: 'string', id: 'https://example.test/a' }))
                .to.throw(GeneverStrictModeError, /Unknown keyword "id"/u)
                .with.property('pointer', '#/id');
        });

        test('id names nothing', () => {
            expect(() =>
                genever(
                    {
                        $schema: 'https://json-schema.org/draft/2020-12/schema',
                        type: 'object',
                        properties: { a: { $ref: 'https://example.test/a' } },
                        $defs: { A: { id: 'https://example.test/a' } },
                    },
                    { strict: false }
                )
            ).to.throw(/Only references within the same document/u);
        });

        test('exclusive bounds are numbers', () => {
            expect(() => genever({ type: 'number', minimum: 1, exclusiveMinimum: true }))
                .to.throw(GeneverInvalidSchemaError, /Must be a number/u)
                .with.property('pointer', '#/exclusiveMinimum');
        });
    });
});

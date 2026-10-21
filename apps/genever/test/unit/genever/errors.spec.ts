import { expect } from '@leyman/expect';
import {
    genever,
    GeneverError,
    GeneverInvalidSchemaError,
    GeneverStrictModeError,
    GeneverUnsupportedError,
} from 'genever';
import { suite, test } from 'mocha-chain';

suite('errors', () => {
    suite('error details', () => {
        const invalid = { type: 'object', properties: { a: { type: 'foo' } } };

        test('extends GeneverError', () => {
            expect(() => genever(invalid)).to.throw(GeneverError);
        });

        test('has a name', () => {
            expect(() => genever(invalid))
                .to.throw(GeneverInvalidSchemaError)
                .with.property('name', 'GeneverInvalidSchemaError');
        });

        test('has a pointer to the problem', () => {
            expect(() => genever(invalid))
                .to.throw(GeneverInvalidSchemaError)
                .with.property('pointer', '#/properties/a/type');
        });
    });

    suite('invalid schema', () => {
        const invalid: Record<string, unknown> = {
            'schema is not an object': { type: 'array', items: 'string' },
            'schema is an array': [],
            'type is empty': { type: [] },
            'type is unknown': { type: 'date' },
            'enum is not an array': { enum: 'a' },
            'allOf is empty': { allOf: [] },
            'anyOf is not an array': { anyOf: {} },
            'properties is not an object': { type: 'object', properties: [] },
            'required is not strings': { type: 'object', required: [1] },
            'required is not an array': { type: 'object', required: 'a' },
            'patternProperties is not an object': { type: 'object', patternProperties: true },
            'pattern is not a string': { type: 'string', pattern: 1 },
            'pattern is not a regular expression': { type: 'string', pattern: '(' },
            'property pattern is not a regular expression': {
                type: 'object',
                patternProperties: { '(': true },
            },
            'minItems is negative': { type: 'array', minItems: -1 },
            'minItems is not an integer': { type: 'array', minItems: 1.5 },
            '$ref is not a string': { $ref: 1 },
            '$ref does not resolve': { $ref: '#/$defs/Missing' },
            '$ref through a primitive': { $ref: '#/type/foo', type: 'string' },
            '$ref is not encoded': { $ref: '#/%E0%A4%A' },
            '$ref is not a URI': { $ref: 'https://[' },
            '$ref names a missing anchor': { $ref: '#missing' },
            '$ref through aliases to itself': {
                $ref: 'a.json',
                $defs: {
                    A: { $id: 'a.json', $ref: 'b.json' },
                    B: { $id: 'b.json', $ref: 'a.json' },
                },
            },
            '$id is not a string': { $id: 1 },
            '$id has a fragment': { $defs: { A: { $id: 'a.json#b' } } },
            '$id is not a URI': { $defs: { A: { $id: 'https://[' } } },
            '$id declared twice': { $defs: { A: { $id: 'a.json' }, B: { $id: 'a.json' } } },
            'anchor declared twice': { $defs: { A: { $anchor: 'a' }, B: { $anchor: 'a' } } },
            'anchor is not a name': { $defs: { A: { $anchor: '1a' } } },
            'anchor is not a string': { $defs: { A: { $anchor: 1 } } },
            '$defs is not an object': { $defs: [] },
            'dependentRequired is not an object': { type: 'object', dependentRequired: [] },
            'nullable is not a boolean': { type: 'string', nullable: 'yes' },
            'minLength is not an integer': { type: 'string', minLength: 'a' },
            'maxItems is negative': { type: 'array', maxItems: -1 },
            'minimum is not a number': { type: 'number', minimum: '1' },
            'exclusiveMaximum is not a number or boolean': {
                type: 'number',
                exclusiveMaximum: '1',
            },
        };
        for (const [name, schema] of Object.entries(invalid)) {
            test(name, () => {
                expect(() => genever(schema, { openApi30: true })).to.throw(
                    GeneverInvalidSchemaError
                );
            });
        }
    });

    suite('strict mode', () => {
        const nonStrict: Record<string, unknown> = {
            'unknown keyword': { type: 'string', foo: 1 },
            'OpenAPI 3.0 keyword': { type: 'string', nullable: true },
            'type keyword without a type': { maxLength: 1 },
            'keyword for another type': { type: 'number', maxLength: 1 },
            'required property not declared': {
                type: 'object',
                properties: { a: true },
                required: ['b'],
            },
            'then without if': { type: 'string', then: { maxLength: 1 } },
            'else without if': { type: 'string', else: { maxLength: 1 } },
            'enum value of another type': { type: 'string', enum: ['a', 1] },
            'const of another type': { type: 'integer', const: 1.5 },
            'minLength greater than maxLength': { type: 'string', minLength: 3, maxLength: 2 },
            'minimum greater than maximum': { type: 'number', minimum: 3, maximum: 2 },
            'minItems greater than maxItems': { type: 'array', minItems: 3, maxItems: 2 },
            'maxItems less than prefixItems': {
                type: 'array',
                prefixItems: [true, true],
                maxItems: 1,
            },
            'required property that is never valid': {
                type: 'object',
                properties: { a: false },
                required: ['a'],
            },
        };
        for (const [name, schema] of Object.entries(nonStrict)) {
            test(name, () => {
                expect(() => genever(schema)).to.throw(GeneverStrictModeError);
            });
        }

        test('extension keywords are allowed', () => {
            expect(() => genever({ type: 'string', 'x-foo': 1 })).not.to.throw();
        });

        test('number keywords apply to integers', () => {
            expect(() => genever({ type: 'integer', minimum: 0 })).not.to.throw();
        });
    });

    suite('unsupported', () => {
        test('$ref to another document', () => {
            expect(() => genever({ $ref: 'other.json#/$defs/A' })).to.throw(
                GeneverUnsupportedError
            );
        });

        test('$dynamicRef', () => {
            expect(() => genever({ $dynamicRef: '#node' }, { strict: false })).to.throw(
                GeneverUnsupportedError
            );
        });
    });
});

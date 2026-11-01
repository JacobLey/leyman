import type { Schema } from 'juniper';
import * as fc from 'fast-check';
import { expect } from '@leyman/expect';
import {
    arraySchema,
    defineRecursive,
    enumSchema,
    mergeSchema,
    numberSchema,
    objectSchema,
    stringSchema,
    tupleSchema,
} from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';
import { makeValidator } from 'juniper-validator';
import { suite, test } from 'mocha-chain';

const options = { numRuns: 100, seed: 42 };

const user = objectSchema({
    properties: {
        name: stringSchema().minLength(1),
        email: stringSchema().format('email'),
        age: numberSchema().type('integer').minimum(0),
    },
    required: ['name', 'email'],
});

interface Tree {
    children: Tree[];
    value: number;
}

const schemas: Readonly<Record<string, Schema<unknown>>> = {
    user,
    'closed object': objectSchema({
        properties: { a: stringSchema() },
        additionalProperties: false,
    }),
    'typed additional properties': objectSchema({
        properties: { a: stringSchema() },
        additionalProperties: numberSchema(),
    }),
    'formats and patterns': objectSchema({
        properties: {
            at: stringSchema().format('date-time'),
            id: stringSchema().format('uuid'),
            url: stringSchema().format('uri'),
            slug: stringSchema().startsWith('a').contains('b').endsWith('c'),
        },
    }),
    tuple: tupleSchema().prefixItem(numberSchema()).prefixItem(stringSchema()),
    'unique items': arraySchema(numberSchema().type('integer')).uniqueItems(true),
    enum: enumSchema({ enum: ['a', 1, null] }),
    anyOf: mergeSchema().anyOf([numberSchema(), stringSchema().nullable()]),
    oneOf: mergeSchema().oneOf([numberSchema().minimum(0), numberSchema().maximum(5)]),
    recursion: defineRecursive<Tree>('Tree', self =>
        objectSchema({
            properties: { value: numberSchema(), children: arraySchema(self) },
            required: ['value', 'children'],
        })
    ),
};

suite('Generated values', () => {
    for (const [name, schema] of Object.entries(schemas)) {
        test(`Accepts every value of ${name}`, () => {
            const validator = makeValidator(schema);
            fc.assert(
                fc.property(makeArbitrary(schema), value => validator.is(value)),
                options
            );
        });
    }

    test('Validating returns the value it was given', () => {
        const validator = makeValidator(user);
        fc.assert(
            fc.property(makeArbitrary(user), value => {
                expect(validator.validate(value)).to.deep.equal({ value });
            }),
            options
        );
    });

    test('Assigns a missing property its own path, on any value', () => {
        const validator = makeValidator(user);
        fc.assert(
            fc.property(makeArbitrary(user), ({ email: _email, ...value }) => {
                const issues = validator.validate(value).issues ?? [];
                expect(issues.map(issue => issue.path)).to.deep.equal([['email']]);
            }),
            options
        );
    });
});

import type { Schema, SchemaType } from 'juniper';
import type { SchemaNode } from '#internal/lib/flatten.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import { expectTypeOf } from 'expect-type';
import * as fc from 'fast-check';
import { expect } from '@leyman/expect';
import { defaultImport } from 'default-import';
import {
    ArraySchema,
    arraySchema,
    booleanSchema,
    customSchema,
    defineRecursive,
    enumSchema,
    mergeSchema,
    neverSchema,
    nullSchema,
    numberSchema,
    objectSchema,
    stringSchema,
    tupleSchema,
} from 'juniper';
import {
    JuniperArbitraryError,
    makeArbitrary,
    UnsatisfiableSchemaError,
    UnsupportedSchemaError,
} from 'juniper-arbitrary';
import { suite, test } from 'mocha-chain';
import { Builder } from '#internal/lib/build.js';
import { LazyArbitrary } from '#internal/lib/filtered-arbitrary.js';

const sample = <T>(schema: Schema<T>): T[] =>
    fc.sample(makeArbitrary(schema), { numRuns: 200, seed: 42 });

const addFormats = defaultImport(ajvFormats);

// Not strict, since these test what a schema means rather than how it is written
const compile = (schema: Schema<unknown>): ((value: unknown) => boolean) => {
    const validate = addFormats(
        new Ajv2020({ discriminator: true, logger: false, strict: false })
    ).compile(schema.toJSON());
    return value => validate(value);
};

const expectAllValid = (schema: Schema<unknown>): void => {
    const validate = compile(schema);
    for (const value of sample(schema)) {
        expect(validate(value), JSON.stringify(value)).to.equal(true);
    }
};

interface Tree {
    children: Tree[];
    value: number;
}

const tree = defineRecursive<Tree>('Tree', self =>
    objectSchema({
        properties: { value: numberSchema(), children: arraySchema(self) },
        required: ['value', 'children'],
    })
);

const definedName = stringSchema().minLength(1).define('Name');

suite('makeArbitrary', () => {
    suite('Only generates valid values', () => {
        const cases: Readonly<Record<string, Schema<unknown>>> = {
            string: stringSchema(),
            'string lengths': stringSchema().minLength(2).maxLength(4),
            pattern: stringSchema().pattern('^[a-z]+$'),
            'several patterns': stringSchema().startsWith('foo').contains('mid').endsWith('bar'),
            'pattern and length': stringSchema().pattern('^a+$').maxLength(3),
            lookahead: stringSchema().pattern(String.raw`^(?=.*\d)(?=.*[a-z]).{8,}$`),
            'nested lookahead': stringSchema().pattern(String.raw`^(?=(a|\)))..$`),
            'content encoding': stringSchema().contentEncoding('base64'),
            'format with length': stringSchema().format('email').maxLength(12),
            'format with a long minLength': stringSchema().format('email').minLength(200),
            'format with both lengths': stringSchema().format('uri').minLength(30).maxLength(40),
            'pattern with a long minLength': stringSchema().pattern('^[a-z]+$').minLength(60),
            'format with pattern': stringSchema().format('uuid').pattern('^[0-9a-f-]+$'),
            'unknown format': stringSchema().format('made-up'),
            number: numberSchema(),
            'number bounds': numberSchema().minimum(1).maximum(2),
            'exclusive bounds': numberSchema().exclusiveMinimum(0).exclusiveMaximum(1),
            'fractional range without an integer': numberSchema().minimum(0.25).maximum(0.75),
            integer: numberSchema().type('integer'),
            'integer bounds': numberSchema().type('integer').minimum(-3.5).maximum(3.5),
            'exclusive integer bounds': numberSchema()
                .type('integer')
                .exclusiveMinimum(0)
                .exclusiveMaximum(3),
            'large integers': numberSchema()
                .type('integer')
                .minimum(2 ** 40),
            'multiple of': numberSchema().multipleOf(7).minimum(-100).maximum(100),
            'fractional multiple of': numberSchema().multipleOf(0.1).minimum(0).maximum(5),
            'several multiples': numberSchema().multipleOf(0.5).multipleOf(0.25),
            array: arraySchema(numberSchema()),
            'untyped items': arraySchema(),
            'array lengths': arraySchema(stringSchema()).minItems(2).maxItems(3),
            'unique items': arraySchema(numberSchema().type('integer').minimum(0).maximum(9))
                .uniqueItems(true)
                .minItems(2),
            contains: arraySchema(numberSchema()).contains(numberSchema().minimum(1000)),
            'contains with limit': arraySchema(numberSchema().type('integer').minimum(0).maximum(3))
                .contains(numberSchema().minimum(3))
                .maxContains(2),
            'contains unique': arraySchema(numberSchema())
                .contains(numberSchema().minimum(3))
                .uniqueItems(true),
            'prefix items and rest': arraySchema(stringSchema()).prefixItem(numberSchema()),
            'prefix with maxItems': arraySchema(stringSchema())
                .prefixItem(numberSchema())
                .prefixItem(numberSchema())
                .maxItems(1),
            tuple: tupleSchema().prefixItem(numberSchema()).prefixItem(stringSchema()),
            object: objectSchema({
                properties: { a: numberSchema(), b: stringSchema() },
                required: ['b'],
            }),
            'closed object': objectSchema()
                .properties({ a: numberSchema() })
                .additionalProperties(false),
            'typed additional properties': objectSchema()
                .additionalProperties(numberSchema())
                .minProperties(2),
            'maxProperties leaves room': objectSchema()
                .properties({ a: numberSchema() })
                .maxProperties(9),
            'maxProperties smaller than properties': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema(), c: numberSchema() })
                .maxProperties(1),
            'maxProperties with pattern and additional properties': objectSchema()
                .properties({ a: numberSchema() })
                .patternProperties('^x', numberSchema())
                .maxProperties(2),
            'minProperties beyond declared': objectSchema()
                .properties({ a: numberSchema() })
                .minProperties(3),
            'minProperties only patterns can reach': customSchema({
                type: 'object',
                properties: { a: { type: 'number' } },
                patternProperties: { '^x': { type: 'number' } },
                additionalProperties: false,
                minProperties: 2,
            }),
            'required keys at maxProperties': objectSchema({
                properties: { a: numberSchema(), b: numberSchema() },
                required: ['a'],
            }).maxProperties(1),
            'dependent required beyond maxProperties': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema(), c: numberSchema() })
                .dependentRequired('a', ['b', 'c'])
                .maxProperties(2),
            'minProperties beyond required': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema() })
                .additionalProperties(false)
                .minProperties(1),
            'pattern properties': objectSchema()
                .patternProperties('^x', numberSchema())
                .additionalProperties(false),
            'pattern covers a required key': customSchema({
                type: 'object',
                required: ['xa'],
                patternProperties: { '^x': { type: 'number' } },
                additionalProperties: false,
            }),
            'pattern forbidding keys': customSchema({
                type: 'object',
                patternProperties: { '^x': false },
            }),
            'required without a declaration': customSchema({
                type: 'object',
                required: ['a'],
                additionalProperties: { type: 'number' },
            }),
            'property names': customSchema({
                type: 'object',
                propertyNames: { pattern: '^k' },
                additionalProperties: { type: 'number' },
            }),
            'dependent required': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema() })
                .dependentRequired('a', ['b']),
            'dependent schemas': customSchema({
                type: 'object',
                properties: { a: { type: 'number' } },
                dependentSchemas: { a: { required: ['b'], properties: { b: { const: 1 } } } },
            }),
            enum: enumSchema({ enum: ['a', 'b', 1, null] }),
            const: enumSchema({ enum: ['x'] }),
            'enum beside other keywords': customSchema({
                enum: [1, 2, 'a'],
                type: 'number',
                minimum: 2,
            }),
            'enum merged': mergeSchema()
                .allOf(enumSchema({ enum: [1, 2, 3] }))
                .allOf(enumSchema({ enum: [2, 3, 4] })),
            'objects in enum': customSchema({ const: { a: [1, null] } }),
            'arrays in enum': customSchema({ const: [1, 'a'] }),
            'enum filtered to integers': customSchema({ enum: [1, 1.5], type: 'integer' }),
            'property names forbidden': customSchema({
                type: 'object',
                propertyNames: false,
            }),
            'embedded $id': customSchema({
                $ref: 'number.json',
                $defs: { number: { $id: 'number.json', type: 'number' } },
            }),
            'both set minContains': customSchema({
                type: 'array',
                allOf: [
                    { contains: { type: 'number' }, minContains: 1 },
                    { contains: { minimum: 1 }, minContains: 2 },
                ],
            }),
            'unique objects and arrays': arraySchema(
                mergeSchema().anyOf([
                    arraySchema(numberSchema()),
                    objectSchema({
                        properties: { b: numberSchema(), a: numberSchema() },
                        required: ['b', 'a'],
                    }),
                ])
            ).uniqueItems(true),
            'equal bounds': numberSchema().minimum(1).maximum(1),
            'allOf closed object then pattern': mergeSchema()
                .allOf(objectSchema().additionalProperties(numberSchema()))
                .allOf(objectSchema().patternProperties('^x', numberSchema())),
            null: nullSchema(),
            boolean: booleanSchema(),
            nullable: stringSchema().nullable(),
            'anything goes': mergeSchema(),
            'keywords with no type': customSchema({ minLength: 3, minimum: 3, minItems: 1 }),
            anyOf: mergeSchema().anyOf([numberSchema(), stringSchema()]),
            oneOf: mergeSchema().oneOf([numberSchema().minimum(0), numberSchema().maximum(5)]),
            'allOf numbers': mergeSchema()
                .allOf(numberSchema().minimum(5))
                .allOf(numberSchema().type('integer').maximum(6)),
            'allOf integer then number': mergeSchema()
                .allOf(numberSchema().type('integer'))
                .allOf(numberSchema()),
            'allOf objects': mergeSchema()
                .allOf(objectSchema({ properties: { a: numberSchema() }, required: ['a'] }))
                .allOf(objectSchema({ properties: { b: numberSchema() }, required: ['b'] })),
            'allOf the same property': mergeSchema()
                .allOf(objectSchema().properties({ a: numberSchema().minimum(1) }))
                .allOf(objectSchema().properties({ a: numberSchema().maximum(2) })),
            'allOf closed object': mergeSchema()
                .allOf(objectSchema().additionalProperties(false))
                .allOf(objectSchema().properties({ a: numberSchema() })),
            'allOf object then closed': mergeSchema()
                .allOf(objectSchema().properties({ a: numberSchema() }))
                .allOf(objectSchema().additionalProperties(false)),
            'allOf closed branch covering by pattern': customSchema({
                type: 'object',
                allOf: [
                    { additionalProperties: false, patternProperties: { '^a': true } },
                    { properties: { ab: { type: 'number' }, b: { type: 'number' } } },
                ],
            }),
            'closed branch with unevaluated properties': customSchema({
                type: 'object',
                allOf: [{ additionalProperties: { type: 'number' } }],
                properties: { a: { type: 'string' }, b: { type: 'number' } },
                unevaluatedProperties: false,
            }),
            'allOf items and prefix': customSchema({
                allOf: [
                    { items: { type: 'number' } },
                    { prefixItems: [{ type: 'number' }, { minimum: 1 }] },
                    { prefixItems: [{ minimum: 0 }] },
                ],
            }),
            'allOf prefix then items': customSchema({
                allOf: [{ prefixItems: [{ type: 'number' }] }, { items: { type: 'number' } }],
                type: 'array',
            }),
            not: numberSchema().not(numberSchema().minimum(0)),
            if: objectSchema({
                properties: { k: stringSchema(), v: numberSchema() },
            }).if(
                objectSchema({
                    properties: { k: enumSchema({ enum: ['x'] }) },
                    required: ['k'],
                }),
                {
                    // eslint-disable-next-line unicorn/no-thenable -- Juniper's `if` keyword
                    then: objectSchema({ properties: { v: numberSchema() }, required: ['v'] }),
                }
            ),
            'if without then or else': customSchema({ if: { type: 'number' } }),
            'unevaluated properties': customSchema({
                allOf: [{ properties: { a: { type: 'number' } } }],
                unevaluatedProperties: false,
            }),
            'never in optional property': objectSchema().properties({ a: neverSchema() }),
            'never in items': customSchema({ type: 'array', items: false }),
            'never in prefix items': customSchema({
                type: 'array',
                prefixItems: [{ type: 'number' }, false, { type: 'number' }],
            }),
            'never in anyOf': mergeSchema().anyOf([neverSchema(), numberSchema()]),
            'closed additional keys by pattern': customSchema({
                type: 'object',
                additionalProperties: false,
                patternProperties: { '^x': { type: 'number' } },
            }),
            'definition used twice': objectSchema({
                properties: { a: definedName, b: definedName },
                required: ['a'],
            }),
            'ref with escaped path': customSchema({
                $ref: '#/$defs/a~1b%20c',
                $defs: { 'a/b c': { type: 'number' } },
            }),
            'ref to a property': customSchema({
                type: 'object',
                properties: {
                    a: { type: 'string', not: { const: 'x' } },
                    b: { $ref: '#/properties/a' },
                },
            }),
            'nullable recursion': defineRecursive<{ next: unknown }>('List', self =>
                objectSchema({ properties: { next: self.nullable() }, required: ['next'] })
            ),
            'optional recursion': defineRecursive<object>('Binary', self =>
                objectSchema().properties({ left: self, right: self })
            ),
            'recursive union': defineRecursive<unknown>('Expression', self =>
                mergeSchema().anyOf([
                    numberSchema(),
                    objectSchema({
                        properties: { args: arraySchema(self).minItems(1) },
                        required: ['args'],
                    }),
                ])
            ),
            'recursive additional properties': defineRecursive<object>('Nested', self =>
                objectSchema().additionalProperties(self)
            ),
            'recursive optional properties within maxProperties': defineRecursive<object>(
                'Bounded',
                self => objectSchema().properties({ left: self, right: self }).maxProperties(1)
            ),
            'recursive optional properties beyond minProperties': defineRecursive<object>(
                'Leaf',
                self =>
                    objectSchema()
                        .properties({ leaf: numberSchema(), next: self })
                        .additionalProperties(false)
                        .minProperties(1)
            ),
            'recursive pattern properties': defineRecursive<object>('Patterned', self =>
                objectSchema().patternProperties('^p', self)
            ),
            'recursive contains': defineRecursive<unknown[]>('Holder', self =>
                arraySchema(self).contains(self).minContains(0)
            ),
            tree,
        };

        for (const [name, schema] of Object.entries(cases)) {
            test(name, () => {
                expectAllValid(schema);
            });
        }

        const formats = [
            'binary',
            'byte',
            'date',
            'date-time',
            'duration',
            'email',
            'hostname',
            'idn-email',
            'idn-hostname',
            'ipv4',
            'ipv6',
            'iri',
            'iri-reference',
            'json-pointer',
            'password',
            'regex',
            'relative-json-pointer',
            'time',
            'uri',
            'uri-reference',
            'uri-template',
            'uuid',
        ];
        for (const format of formats) {
            test(`format ${format}`, () => {
                expectAllValid(stringSchema().format(format));
            });
        }
    });

    suite('Aims true without the validator', () => {
        // With its checks switched off, these only come out valid if the generators got them right
        const cases: Readonly<Record<string, Schema<unknown>>> = {
            'string lengths': stringSchema().minLength(2).maxLength(4),
            pattern: stringSchema().pattern('^[a-z]+$'),
            format: stringSchema().format('date-time'),
            'number bounds': numberSchema().exclusiveMinimum(0).maximum(2),
            integer: numberSchema().type('integer').minimum(-3.5).maximum(3.5),
            'multiple of': numberSchema().multipleOf(7).minimum(-100).maximum(100),
            'array lengths': arraySchema(stringSchema()).minItems(2).maxItems(3),
            'unique items': arraySchema(numberSchema().type('integer').minimum(0).maximum(9))
                .uniqueItems(true)
                .minItems(2),
            contains: arraySchema(numberSchema()).contains(numberSchema().minimum(1000)),
            tuple: tupleSchema().prefixItem(numberSchema()).prefixItem(stringSchema()),
            object: objectSchema({
                properties: { a: numberSchema(), b: stringSchema() },
                required: ['b'],
            }),
            'closed object': objectSchema()
                .properties({ a: numberSchema() })
                .additionalProperties(false),
            'typed additional properties': objectSchema()
                .additionalProperties(numberSchema())
                .minProperties(2),
            'dependent required': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema() })
                .dependentRequired('a', ['b']),
            'pattern covers a required key': customSchema({
                type: 'object',
                required: ['xa'],
                patternProperties: { '^x': { type: 'number' } },
                additionalProperties: false,
            }),
            'patterns covering a declared key': customSchema({
                type: 'object',
                properties: { xa: { minimum: 0 } },
                required: ['xa'],
                patternProperties: {
                    '^x': { type: 'number' },
                    '^xa$': { maximum: 5 },
                },
                additionalProperties: false,
            }),
            'maxProperties smaller than properties': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema(), c: numberSchema() })
                .maxProperties(1),
            'maxProperties with pattern and additional properties': objectSchema()
                .properties({ a: numberSchema() })
                .patternProperties('^x', numberSchema())
                .maxProperties(2),
            'minProperties beyond required': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema() })
                .additionalProperties(false)
                .minProperties(1),
            'minProperties beyond declared': objectSchema()
                .properties({ a: numberSchema() })
                .minProperties(3),
            'dependent required beyond maxProperties': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema(), c: numberSchema() })
                .dependentRequired('a', ['b', 'c'])
                .maxProperties(2),
            'dependent required in a closed object': objectSchema()
                .properties({ a: numberSchema(), b: numberSchema() })
                .additionalProperties(false)
                .dependentRequired('a', ['b']),
            'allOf closed object': mergeSchema()
                .allOf(objectSchema().additionalProperties(false))
                .allOf(objectSchema().properties({ a: numberSchema(), b: numberSchema() })),
            'allOf object then closed': mergeSchema()
                .allOf(objectSchema().properties({ a: numberSchema() }))
                .allOf(
                    objectSchema().properties({ b: numberSchema() }).additionalProperties(false)
                ),
            'allOf typed additional properties': customSchema({
                type: 'object',
                allOf: [
                    { properties: { a: { type: 'number' } } },
                    { additionalProperties: { minimum: 1 } },
                ],
            }),
            anyOf: mergeSchema().anyOf([numberSchema(), stringSchema()]),
            allOf: mergeSchema()
                .allOf(numberSchema().minimum(5))
                .allOf(numberSchema().type('integer').maximum(6)),
            tree,
        };
        for (const [name, schema] of Object.entries(cases)) {
            test(name, () => {
                const root = schema.toJSON() as SchemaNode;
                const builder = new Builder({ root, validatorFor: () => () => true });
                const arbitrary = builder.build(root, '#');
                const validate = compile(schema);
                const values = fc.sample(arbitrary!, { numRuns: 200, seed: 42 });
                for (const value of values) {
                    expect(validate(value), JSON.stringify(value)).to.equal(true);
                }
            });
        }

        test('declared keys are checked against propertyNames while building', () => {
            const schema = customSchema({
                type: 'object',
                properties: { a: { type: 'number' }, kb: { type: 'number' } },
                propertyNames: { pattern: '^k' },
                additionalProperties: { type: 'number' },
            });
            const root = schema.toJSON() as SchemaNode;
            const validate = compile(schema);
            const checked: string[] = [];
            const builder = new Builder({
                root,
                validatorFor: (node, path) => {
                    checked.push(path);
                    return compile(customSchema(node as Record<string, unknown>));
                },
            });
            const values = fc.sample(builder.build(root, '#')!, { numRuns: 200, seed: 42 });
            for (const value of values) {
                expect(validate(value), JSON.stringify(value)).to.equal(true);
            }
            expect(checked).to.deep.equal(['#/propertyNames']);
        });
    });

    suite('Reaches what the schema allows', () => {
        test('optional properties are both present and absent', () => {
            const values = sample(objectSchema().properties({ a: numberSchema() }));
            expect(new Set(values.map(value => Object.hasOwn(value, 'a')))).to.deep.equal(
                new Set([true, false])
            );
        });

        test('open objects get undeclared properties', () => {
            const values = sample(objectSchema().properties({ a: numberSchema() }));
            expect(values.some(value => Object.keys(value).some(key => key !== 'a'))).to.equal(
                true
            );
        });

        test('closed objects do not', () => {
            const values = sample(
                objectSchema().properties({ a: numberSchema() }).additionalProperties(false)
            );
            expect(values.every(value => Object.keys(value).every(key => key === 'a'))).to.equal(
                true
            );
        });

        test('every property count maxProperties allows', () => {
            const values = sample(
                objectSchema()
                    .properties({ a: numberSchema(), b: numberSchema(), c: numberSchema() })
                    .additionalProperties(false)
                    .maxProperties(2)
            );
            expect(new Set(values.map(value => Object.keys(value).length))).to.deep.equal(
                new Set([0, 1, 2])
            );
        });

        test('keys a closed allOf branch covers by pattern, and no others', () => {
            const values = sample(
                customSchema({
                    type: 'object',
                    allOf: [
                        { additionalProperties: false, patternProperties: { '^a': true } },
                        { properties: { ab: { type: 'number' }, b: { type: 'number' } } },
                    ],
                }) as Schema<Record<string, unknown>>
            );
            expect(values.some(value => Object.hasOwn(value, 'ab'))).to.equal(true);
            expect(values.some(value => Object.hasOwn(value, 'b'))).to.equal(false);
        });

        test('every anyOf branch', () => {
            const values = sample(mergeSchema().anyOf([numberSchema(), stringSchema()]));
            expect(new Set(values.map(value => typeof value))).to.deep.equal(
                new Set(['number', 'string'])
            );
        });

        test('numbers include everyday integers', () => {
            const values = sample(numberSchema());
            expect(
                values.some(value => Number.isSafeInteger(value) && Math.abs(value) < 100)
            ).to.equal(true);
        });

        test('recursion goes more than one level', () => {
            const values = sample(tree);
            expect(
                values.some(value => value.children.some(child => child.children.length > 0))
            ).to.equal(true);
        });

        test('prefix items may stop short, as their type says', () => {
            const schema = arraySchema(ArraySchema.falseItems)
                .prefixItem(numberSchema())
                .prefixItem(numberSchema());
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<[number?, number?]>();
            expect(new Set(sample(schema).map(value => value.length))).to.deep.equal(
                new Set([0, 1, 2])
            );
        });

        test('down to minItems', () => {
            const schema = arraySchema(ArraySchema.falseItems)
                .prefixItem(numberSchema())
                .prefixItem(numberSchema())
                .minItems(1);
            expect(new Set(sample(schema).map(value => value.length))).to.deep.equal(
                new Set([1, 2])
            );
        });
    });

    suite('Values are plain JSON', () => {
        test('survive a round trip', () => {
            for (const value of sample(mergeSchema())) {
                // eslint-disable-next-line unicorn/prefer-structured-clone -- JSON is the point
                expect(JSON.parse(JSON.stringify(value))).to.deep.equal(value);
            }
        });

        test('no negative zero', () => {
            const schema = numberSchema().multipleOf(2).minimum(-2).maximum(2);
            expect(sample(schema).some(value => Object.is(value, -0))).to.equal(false);
        });
    });

    suite('Shrinks', () => {
        test('to a smaller value that still validates', () => {
            const schema = arraySchema(numberSchema().minimum(5)).minItems(1);
            const failure = fc.check(
                fc.property(makeArbitrary(schema), value => value.length < 3),
                { seed: 42 }
            );
            expect(failure.counterexample?.[0]).to.have.length(3);
        });

        test('values given rather than generated', () => {
            const schema = stringSchema().pattern('^a+$').maxLength(3);
            const arbitrary = makeArbitrary(schema);
            expect(arbitrary.canShrinkWithoutContext('aa')).to.equal(true);
            expect(arbitrary.canShrinkWithoutContext('aaaa')).to.equal(false);
        });

        test('through recursion', () => {
            const failure = fc.check(
                fc.property(makeArbitrary(tree), value => value.children.length === 0),
                { seed: 42 }
            );
            expect(failure.counterexample?.[0]?.children).to.have.length(1);
        });

        test('values given rather than generated, through a lazy arbitrary', () => {
            const arbitrary = new LazyArbitrary(() => fc.constant(1), '#');
            expect(arbitrary.canShrinkWithoutContext(1)).to.equal(true);
        });
    });

    suite('Types', () => {
        test('matches the schema', () => {
            const schema = objectSchema({
                properties: { a: numberSchema(), b: stringSchema() },
                required: ['b'],
            });
            expectTypeOf(makeArbitrary(schema)).toEqualTypeOf<
                fc.Arbitrary<SchemaType<typeof schema>>
            >();
        });
    });

    suite('Fails loudly', () => {
        const nothingMatches: Readonly<Record<string, Schema<unknown>>> = {
            never: neverSchema(),
            'never as a required property': objectSchema({
                properties: { a: neverSchema() },
                required: ['a'],
            }),
            'contradictory bounds': numberSchema().minimum(5).maximum(1),
            'contradictory integer bounds': numberSchema()
                .type('integer')
                .minimum(0.25)
                .maximum(0.75),
            'equal bounds excluded': numberSchema().exclusiveMinimum(1).maximum(1),
            'upper bound excluded': numberSchema().minimum(1).exclusiveMaximum(1),
            'contradictory types': mergeSchema().allOf(stringSchema()).allOf(numberSchema()),
            'contradictory lengths': stringSchema().minLength(5).maxLength(1),
            'contradictory items': arraySchema(numberSchema()).minItems(5).maxItems(1),
            'contradictory properties': objectSchema().minProperties(5).maxProperties(1),
            'contradictory enums': mergeSchema()
                .allOf(enumSchema({ enum: [1] }))
                .allOf(enumSchema({ enum: [2] })),
            'enum of the wrong type': customSchema({ enum: ['a'], type: 'number' }),
            'false schema': customSchema({ allOf: [false] }),
            'not everything': customSchema({ not: true }),
            'items that must exist but cannot': customSchema({
                type: 'array',
                items: false,
                minItems: 1,
            }),
            'contains that cannot match': customSchema({ type: 'array', contains: false }),
            'contains with no room': customSchema({
                type: 'array',
                contains: { type: 'number' },
                maxItems: 0,
            }),
            'more required keys than maxProperties': objectSchema({
                properties: { a: numberSchema(), b: numberSchema() },
                required: ['a', 'b'],
            }).maxProperties(1),
            'a required key a closed allOf branch forbids': customSchema({
                type: 'object',
                allOf: [
                    { additionalProperties: false },
                    { properties: { a: { type: 'number' } }, required: ['a'] },
                ],
            }),
            'property names reject a required key': customSchema({
                type: 'object',
                required: ['a'],
                propertyNames: { pattern: '^k' },
            }),
        };
        for (const [name, schema] of Object.entries(nothingMatches)) {
            test(`when building: ${name}`, () => {
                expect(() => makeArbitrary(schema)).to.throw(UnsatisfiableSchemaError);
            });
        }

        const rarelyMatches: Readonly<Record<string, Schema<unknown>>> = {
            'a pattern random strings miss': stringSchema().pattern('^a$').pattern('^b$'),
            'a backreference, which plain strings miss':
                stringSchema().pattern(String.raw`^(a)\1$`),
            'a lookahead nothing else satisfies': stringSchema().pattern('^(?=z{20}).*$'),
            'a format whose values are never that short': stringSchema()
                .format('uuid')
                .maxLength(10),
            'recursion with no way out': defineRecursive<object>('Forever', self =>
                objectSchema({ properties: { next: self }, required: ['next'] })
            ),
        };
        for (const [name, schema] of Object.entries(rarelyMatches)) {
            test(`when generating: ${name}`, () => {
                const arbitrary = makeArbitrary(schema);
                expect(() => fc.sample(arbitrary, { numRuns: 1, seed: 42 })).to.throw(
                    UnsatisfiableSchemaError
                );
            });
        }

        test('a recursive definition that matches nothing', () => {
            const schema = customSchema({
                type: 'object',
                properties: { a: { $ref: '#/$defs/b' } },
                required: ['a'],
                $defs: { b: { allOf: [{ $ref: '#/$defs/b' }] } },
            });
            expect(() => makeArbitrary(schema)).to.throw(UnsatisfiableSchemaError);
        });

        test('a definition that only matches nothing once built', () => {
            // `a` holds a reference to `b` before it is known that `b` matches nothing
            const schema = customSchema({
                type: 'object',
                properties: { b: { $ref: '#/$defs/b' }, a: { $ref: '#/$defs/a' } },
                required: ['a'],
                $defs: {
                    a: {
                        type: 'object',
                        properties: { b: { $ref: '#/$defs/b' } },
                        required: ['b'],
                    },
                    b: {
                        type: 'object',
                        properties: { a: { $ref: '#/$defs/a' }, never: false },
                        required: ['never'],
                    },
                },
            });
            expect(() => fc.sample(makeArbitrary(schema), { numRuns: 200, seed: 42 })).to.throw(
                UnsatisfiableSchemaError
            );
        });

        test('error names the part of the schema', () => {
            const schema = objectSchema({
                properties: { a: stringSchema().pattern('^a$').pattern('^b$') },
                required: ['a'],
            });
            const arbitrary = makeArbitrary(schema);
            expect(() => fc.sample(arbitrary, { numRuns: 1, seed: 42 }))
                .to.throw(UnsatisfiableSchemaError)
                .with.property('path', '#/properties/a');
        });

        test('errors share a base class', () => {
            expect(() => makeArbitrary(neverSchema())).to.throw(JuniperArbitraryError);
        });

        test('a reference outside the schema', () => {
            expect(() => makeArbitrary(stringSchema().ref('other.json#/a'))).to.throw(
                UnsupportedSchemaError
            );
        });

        test('a reference to something missing', () => {
            const schema = objectSchema().properties({ a: stringSchema().ref('#/$defs/missing') });
            expect(() => makeArbitrary(schema)).to.throw(UnsupportedSchemaError);
        });
    });
});

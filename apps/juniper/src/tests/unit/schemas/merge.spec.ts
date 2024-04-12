import DefaultAjv from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { defaultImport } from 'default-import';
import {
    enumSchema,
    mergeSchema,
    numberSchema,
    type SchemaType,
    stringSchema,
} from 'juniper';
import { suite, test } from 'mocha-hookup';

const Ajv = defaultImport(DefaultAjv);

suite('MergeSchema', () => {
    suite('allOf', () => {
        test('success', () => {
            const schema = mergeSchema()
                .allOf(stringSchema().startsWith('abc').nullable())
                .allOf(numberSchema().nullable())
                .toJSON();

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<null>();

            expect(schema).to.deep.equal({
                allOf: [
                    { type: ['string', 'null'], pattern: '^abc' },
                    { type: ['number', 'null'] },
                ],
            });
            const validator = new Ajv({ strict: true }).compile(schema);
            expect(validator(null)).to.equal(true);
            expect(validator('abc')).to.equal(false);
            expect(validator(123)).to.equal(false);
        });
    });

    suite('anyOf', () => {
        test('success', () => {
            const schema = mergeSchema()
                .anyOf([
                    stringSchema().endsWith('abc'),
                    stringSchema().startsWith('abc'),
                    numberSchema(),
                ])
                .if(numberSchema(), {
                    else: stringSchema(),
                });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                `${string}abc` | `abc${string}` | number
            >();

            expect(schema.toJSON()).to.deep.equal({
                if: {
                    type: 'number',
                },
                else: {
                    type: 'string',
                },
                anyOf: [
                    { type: 'string', pattern: 'abc$' },
                    { type: 'string', pattern: '^abc' },
                    { type: 'number' },
                ],
            });
            const validator = new Ajv({ strict: true }).compile(
                schema.toJSON()
            );
            expect(validator('abcefg')).to.equal(true);
            expect(validator('aabcefg')).to.equal(false);
            expect(validator('aabcabc')).to.equal(true);
            expect(validator('abcabc')).to.equal(true);
            expect(validator(123.456)).to.equal(true);
            expect(validator(null)).to.equal(false);
            expect(validator(false)).to.equal(false);

            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                allOf: [
                    {
                        anyOf: [
                            {
                                pattern: 'abc$',
                                type: 'string',
                            },
                            {
                                pattern: '^abc',
                                type: 'string',
                            },
                            {
                                type: 'number',
                            },
                        ],
                    },
                ],
                anyOf: [{ type: 'number' }, { type: 'string' }],
            });

            const numSchema = schema.anyOf([
                numberSchema({ type: 'integer' }).nullable(),
            ]);
            expectTypeOf<
                SchemaType<typeof numSchema>
            >().toEqualTypeOf<number>();

            expect(numSchema.toJSON()).to.deep.equal({
                anyOf: [
                    { type: 'string', pattern: 'abc$' },
                    { type: 'string', pattern: '^abc' },
                    { type: 'number' },
                ],
                if: {
                    type: 'number',
                },
                else: {
                    type: 'string',
                },
                allOf: [
                    {
                        anyOf: [{ type: ['integer', 'null'] }],
                    },
                ],
            });
            const numValidator = new Ajv({ strict: true }).compile(
                numSchema.toJSON()
            );
            expect(numValidator('abcefg')).to.equal(false);
            expect(numValidator(123.456)).to.equal(false);
            expect(numValidator(123)).to.equal(true);

            const neverSchema = numSchema.anyOf([]);
            expectTypeOf<
                SchemaType<typeof neverSchema>
            >().toEqualTypeOf<never>();
        });
    });

    suite('if', () => {
        test('success', () => {
            const schema = mergeSchema({ title: '<title>' })
                .if(stringSchema().startsWith('a').nullable(), {
                    // eslint-disable-next-line unicorn/no-thenable
                    then: stringSchema().endsWith('c'),
                })
                .not(enumSchema().enum('abc' as const))
                .not(stringSchema().contains('bbb').nullable());

            expect(schema.toJSON()).to.deep.equal({
                title: '<title>',
                allOf: [
                    {
                        if: {
                            pattern: '^a',
                            type: ['string', 'null'],
                        },
                        // eslint-disable-next-line unicorn/no-thenable
                        then: {
                            pattern: 'c$',
                            type: 'string',
                        },
                        not: {
                            pattern: 'bbb',
                            type: ['string', 'null'],
                        },
                    },
                ],
                not: {
                    const: 'abc',
                },
            });
            const validator = new Ajv({ strict: true }).compile(
                schema.toJSON()
            );
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<unknown>();
            expect(validator(123)).to.equal(true);
            expect(validator('xyz')).to.equal(true);
            expect(validator('a')).to.equal(false);
            expect(validator('abc')).to.equal(false);
            expect(validator('abbc')).to.equal(true);
            expect(validator('abbbc')).to.equal(false);
            expect(validator(null)).to.equal(false);

            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                title: '<title>',
                allOf: [
                    {
                        not: {
                            pattern: 'bbb',
                            type: 'string',
                            nullable: true,
                        },
                    },
                ],
                anyOf: [
                    {
                        not: {
                            pattern: '^a',
                            type: 'string',
                            nullable: true,
                        },
                    },
                    {
                        pattern: 'c$',
                        type: 'string',
                    },
                ],
                not: {
                    enum: ['abc'],
                },
            });
            const oaValidator = new Ajv({ strict: true }).compile(
                schema.toJSON({ openApi30: true })
            );
            expect(oaValidator(123)).to.equal(true);
            expect(oaValidator('xyz')).to.equal(true);
            expect(oaValidator('a')).to.equal(false);
            expect(oaValidator('abc')).to.equal(false);
            expect(oaValidator('abbc')).to.equal(true);
            expect(oaValidator('abbbc')).to.equal(false);
            expect(oaValidator(null)).to.equal(false);
        });
    });

    suite('oneOf', () => {
        test('success', () => {
            const schema = mergeSchema().oneOf([
                stringSchema().endsWith('abc'),
                stringSchema().startsWith('abc'),
                numberSchema(),
            ]);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                `${string}abc` | `abc${string}` | number
            >();

            expect(schema.toJSON()).to.deep.equal({
                oneOf: [
                    { type: 'string', pattern: 'abc$' },
                    { type: 'string', pattern: '^abc' },
                    { type: 'number' },
                ],
            });
            const validator = new Ajv({ strict: true }).compile(
                schema.toJSON()
            );
            expect(validator('abcefg')).to.equal(true);
            expect(validator('aabcefg')).to.equal(false);
            expect(validator('aabcabc')).to.equal(true);
            expect(validator('abcabc')).to.equal(false);
            expect(validator(123.456)).to.equal(true);
            expect(validator(null)).to.equal(false);
            expect(validator(false)).to.equal(false);

            const numSchema = schema.oneOf([
                numberSchema({ type: 'integer' }).nullable(),
            ]);
            expectTypeOf<
                SchemaType<typeof numSchema>
            >().toEqualTypeOf<number>();

            expect(numSchema.toJSON()).to.deep.equal({
                oneOf: [
                    { type: 'string', pattern: 'abc$' },
                    { type: 'string', pattern: '^abc' },
                    { type: 'number' },
                ],
                allOf: [
                    {
                        oneOf: [{ type: ['integer', 'null'] }],
                    },
                ],
            });
            const numValidator = new Ajv({ strict: true }).compile(
                numSchema.toJSON()
            );
            expect(numValidator('abcefg')).to.equal(false);
            expect(numValidator(123.456)).to.equal(false);
            expect(numValidator(123)).to.equal(true);

            const neverSchema = numSchema.oneOf([]);
            expectTypeOf<
                SchemaType<typeof neverSchema>
            >().toEqualTypeOf<never>();
        });
    });

    suite('ref', () => {
        suite('success', () => {
            const schema = mergeSchema()
                .oneOf([stringSchema().startsWith('abc'), numberSchema()])
                .anyOf([
                    enumSchema({
                        enum: [1, 2, 3, 4] as const,
                    }),
                    stringSchema().endsWith('abc'),
                ])
                .ref('/path/to/base')
                .if(numberSchema(), {
                    // eslint-disable-next-line unicorn/no-thenable
                    then: numberSchema({ type: 'integer' }),
                })
                .allOf(mergeSchema().not(enumSchema({ enum: [null] })));

            expect(schema.toJSON()).to.deep.equal({
                $ref: '/path/to/base',
                allOf: [
                    {
                        if: {
                            type: 'number',
                        },
                        // eslint-disable-next-line unicorn/no-thenable
                        then: {
                            type: 'integer',
                        },
                        not: {
                            const: null,
                        },
                    },
                ],
            });

            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                $ref: '/path/to/base',
                allOf: [
                    {
                        anyOf: [
                            {
                                enum: [1, 2, 3, 4],
                            },
                            {
                                type: 'string',
                                pattern: 'abc$',
                            },
                        ],
                        not: {
                            enum: [null],
                        },
                    },
                ],
                anyOf: [
                    {
                        not: {
                            type: 'number',
                        },
                    },
                    {
                        type: 'integer',
                    },
                ],
            });
        });
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            const schema = mergeSchema();

            expectTypeOf<(typeof schema)['nullable']>().toBeNever();
        });
    });
});

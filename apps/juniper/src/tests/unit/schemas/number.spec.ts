import DefaultAjv from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { defaultImport } from 'default-import';
import { numberSchema, type SchemaType } from 'juniper';
import { suite, test } from 'mocha-hookup';

const Ajv = defaultImport(DefaultAjv);

suite('NumberSchema', () => {
    suite('keywords', () => {
        test('options', () => {
            const schema = numberSchema({
                minimum: 4,
                maximum: 10,
                multipleOf: 3,
                type: 'number',
            }).toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
                minimum: 4,
                maximum: 10,
                multipleOf: 3,
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number>();
        });

        test('methods', () => {
            const schema = numberSchema()
                .exclusiveMaximum(20)
                .exclusiveMinimum(-5)
                .type('integer')
                .toJSON();

            expect(schema).to.deep.equal({
                type: 'integer',
                exclusiveMaximum: 20,
                exclusiveMinimum: -5,
            });

            const validator = new Ajv({ strict: true }).compile(schema);
            expect(validator(10)).to.equal(true);
            expect(validator(20)).to.equal(false);
            expect(validator(1.5)).to.equal(false);
        });

        test('Unset options', () => {
            const schema = numberSchema()
                .exclusiveMaximum(20)
                .exclusiveMinimum(-5)
                .maximum(Number.POSITIVE_INFINITY)
                .minimum(Number.NEGATIVE_INFINITY)
                .type('integer')
                .type('number')
                .toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
            });
        });
    });

    suite('multipleOf', () => {
        test('GCD of multipleOf integers', () => {
            const schema = numberSchema({
                multipleOf: [1.5, 4, 6],
            })
                .multipleOf(5)
                .toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
                multipleOf: 60,
                allOf: [
                    {
                        multipleOf: 1.5,
                    },
                ],
            });
        });

        test('Single float multiple', () => {
            const schema = numberSchema({
                multipleOf: 1.5,
            }).toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
                multipleOf: 1.5,
            });
        });

        test('Many float multiple', () => {
            const schema = numberSchema({
                multipleOf: 1.5,
            })
                .multipleOf(3.3)
                .toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
                multipleOf: 1.5,
                allOf: [
                    {
                        multipleOf: 3.3,
                    },
                ],
            });
        });
    });

    suite('ref', () => {
        suite('Applies defaults', () => {
            test('success', () => {
                expect(
                    numberSchema()
                        .maximum(5)
                        .exclusiveMinimum(10)
                        .ref('/path/to/ref')
                        .exclusiveMaximum(Number.POSITIVE_INFINITY)
                        .minimum(Number.NEGATIVE_INFINITY)
                        .toJSON()
                ).to.deep.equal({
                    $ref: '/path/to/ref',
                    exclusiveMinimum: -1.797_693_134_862_315_7e308,
                    maximum: 1.797_693_134_862_315_7e308,
                });
            });

            test('openApi30', () => {
                expect(
                    numberSchema()
                        .exclusiveMaximum(5)
                        .minimum(10)
                        .ref('/path/to/ref')
                        .maximum(Number.POSITIVE_INFINITY)
                        .exclusiveMinimum(Number.NEGATIVE_INFINITY)
                        .toJSON({ openApi30: true })
                ).to.deep.equal({
                    $ref: '/path/to/ref',
                    maximum: 1.797_693_134_862_315_7e308,
                    exclusiveMaximum: false,
                    minimum: -1.797_693_134_862_315_7e308,
                });
            });
        });
    });

    suite('composite', () => {
        test('allOf', () => {
            const schema = numberSchema<1 | 2 | 3 | 4>()
                .nullable()
                .allOf(numberSchema<3 | 4 | 5>().nullable());
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                3 | 4 | null
            >();

            expect(schema.toJSON()).to.deep.equal({
                type: ['number', 'null'],
                allOf: [{}],
            });

            const nonNullableSchema = schema.allOf(numberSchema<4 | 5 | 6>());
            expectTypeOf<
                SchemaType<typeof nonNullableSchema>
            >().toEqualTypeOf<4>();

            expect(nonNullableSchema.toJSON()).to.deep.equal({
                type: 'number',
                allOf: [{}, {}],
            });

            const integerSchema = nonNullableSchema.allOf(
                numberSchema({ type: 'integer' })
            );
            expectTypeOf<SchemaType<typeof integerSchema>>().toEqualTypeOf<4>();

            expect(integerSchema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'integer',
                allOf: [{}, {}, {}],
            });
        });

        test('anyOf', () => {
            const schema = numberSchema<1 | 2 | 3 | 4>()
                .anyOf([numberSchema(), numberSchema().nullable()])
                .nullable()
                .anyOf([numberSchema<3>(), numberSchema<4>().nullable()]);

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                3 | 4 | null
            >();

            expect(schema.toJSON()).to.deep.equal({
                type: ['number', 'null'],
                anyOf: [{ type: 'number' }, {}],
                allOf: [
                    {
                        anyOf: [{ type: 'number' }, {}],
                    },
                ],
            });

            const notNullableSchema = schema.anyOf([numberSchema()]);
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                3 | 4
            >();

            expect(notNullableSchema.toJSON()).to.deep.equal({
                type: 'number',
                anyOf: [{}, {}],
                allOf: [
                    {
                        anyOf: [{}, {}],
                    },
                    {
                        anyOf: [{}],
                    },
                ],
            });

            const integerSchema = schema.anyOf([
                numberSchema({ type: 'integer' }),
            ]);

            expect(integerSchema.toJSON()).to.deep.equal({
                type: 'integer',
                anyOf: [{}, {}],
                allOf: [
                    {
                        anyOf: [{}, {}],
                    },
                    {
                        anyOf: [{}],
                    },
                ],
            });
            new Ajv({ strict: true }).compile(
                integerSchema.toJSON({ openApi30: true })
            );

            expectTypeOf<
                SchemaType<typeof neverSchema>
            >().toEqualTypeOf<never>();

            const neverSchema = numberSchema().nullable().anyOf([]);
            expectTypeOf<
                SchemaType<typeof neverSchema>
            >().toEqualTypeOf<never>();
            expect(neverSchema.toJSON()).to.deep.equal({
                type: 'number',
                anyOf: [],
            });
        });

        test('oneOf', () => {
            const schema = numberSchema<1 | 2 | 3 | 4>()
                .oneOf([numberSchema(), numberSchema().nullable()])
                .nullable()
                .oneOf([numberSchema<3>(), numberSchema<4>().nullable()]);

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                3 | 4 | null
            >();

            expect(schema.toJSON()).to.deep.equal({
                type: ['number', 'null'],
                oneOf: [{ type: 'number' }, {}],
                allOf: [
                    {
                        oneOf: [{ type: 'number' }, {}],
                    },
                ],
            });

            const notNullableSchema = schema.oneOf([numberSchema()]);
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                3 | 4
            >();

            expect(notNullableSchema.toJSON()).to.deep.equal({
                type: 'number',
                oneOf: [{}, {}],
                allOf: [
                    {
                        oneOf: [{}, {}],
                    },
                    {
                        oneOf: [{}],
                    },
                ],
            });

            const integerSchema = schema.oneOf([
                numberSchema({ type: 'integer' }),
            ]);

            expect(integerSchema.toJSON()).to.deep.equal({
                type: 'integer',
                oneOf: [{}, {}],
                allOf: [
                    {
                        oneOf: [{}, {}],
                    },
                    {
                        oneOf: [{}],
                    },
                ],
            });
            new Ajv({ strict: true }).compile(
                integerSchema.toJSON({ openApi30: true })
            );

            expectTypeOf<
                SchemaType<typeof neverSchema>
            >().toEqualTypeOf<never>();

            const neverSchema = numberSchema().nullable().oneOf([]);
            expectTypeOf<
                SchemaType<typeof neverSchema>
            >().toEqualTypeOf<never>();
            expect(neverSchema.toJSON()).to.deep.equal({
                type: 'number',
                oneOf: [],
            });
        });
    });

    suite('toJSON', () => {
        suite('Integer and number', () => {
            test('Integer in number', () => {
                const schema = numberSchema()
                    .not(numberSchema({ type: 'integer', multipleOf: 5 }))
                    .if(numberSchema({ type: 'integer', minimum: 0 }), {
                        // eslint-disable-next-line unicorn/no-thenable
                        then: numberSchema({ type: 'integer', maximum: 100 }),
                    })
                    .toJSON();

                expect(schema).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            if: {
                                type: 'integer',
                                minimum: 0,
                            },
                            // eslint-disable-next-line unicorn/no-thenable
                            then: {
                                type: 'integer',
                                maximum: 100,
                            },
                        },
                    ],
                    not: {
                        type: 'integer',
                        multipleOf: 5,
                    },
                });
            });

            test('All Integers in number', () => {
                const schema = numberSchema()
                    .not(numberSchema({ type: 'integer', multipleOf: 5 }))
                    .if(numberSchema({ type: 'integer', minimum: 0 }), {
                        // eslint-disable-next-line unicorn/no-thenable
                        then: numberSchema({ type: 'integer', maximum: 100 }),
                    })
                    .if(numberSchema({ type: 'integer', minimum: 0 }), {
                        else: numberSchema({ type: 'integer', multipleOf: 5 }),
                    })
                    .toJSON();

                expect(schema).to.deep.equal({
                    type: 'integer',
                    allOf: [
                        {
                            if: {
                                minimum: 0,
                            },
                            // eslint-disable-next-line unicorn/no-thenable
                            then: {
                                maximum: 100,
                            },
                            else: {
                                multipleOf: 5,
                            },
                        },
                    ],
                    not: {
                        multipleOf: 5,
                    },
                });
            });

            test('Number in integer', () => {
                const schema = numberSchema({ type: 'integer' })
                    .not(numberSchema({ multipleOf: 5 }))
                    .if(numberSchema({ minimum: 0 }), {
                        // eslint-disable-next-line unicorn/no-thenable
                        then: numberSchema({ maximum: 100 }),
                    })
                    .toJSON();

                expect(schema).to.deep.equal({
                    type: 'integer',
                    allOf: [
                        {
                            if: {
                                minimum: 0,
                            },
                            // eslint-disable-next-line unicorn/no-thenable
                            then: {
                                maximum: 100,
                            },
                        },
                    ],
                    not: {
                        multipleOf: 5,
                    },
                });
            });
        });

        test('Open Api 3.0', () => {
            const schema = numberSchema()
                .exclusiveMaximum(20)
                .exclusiveMinimum(-5)
                .toJSON({ openApi30: true });

            expect(schema).to.deep.equal({
                type: 'number',
                maximum: 20,
                exclusiveMaximum: true,
                minimum: -5,
                exclusiveMinimum: true,
            });
        });
    });
});

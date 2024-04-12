import DefaultAjv from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { defaultImport } from 'default-import';
import {
    ArraySchema,
    arraySchema,
    type SchemaType,
    stringSchema,
    TupleSchema,
    tupleSchema,
} from 'juniper';
import { suite, test } from 'mocha-hookup';

const Ajv = defaultImport(DefaultAjv);

suite('TupleSchema', () => {
    suite('keywords', () => {
        suite('options', () => {
            test('success', () => {
                const schema = tupleSchema({
                    minContains: 2,
                    maxContains: 5,
                    uniqueItems: true,
                });

                expect(schema.toJSON()).to.deep.equal({
                    type: 'array',
                    items: false,
                    maxItems: 0,
                    uniqueItems: true,
                });
                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<[]>();
                expect(schema).to.be.an.instanceOf(TupleSchema);
                expect(schema).to.be.an.instanceOf(ArraySchema);

                expectTypeOf<(typeof schema)['items']>().toBeNever();
                expectTypeOf<(typeof schema)['maxItems']>().toBeNever();
                expectTypeOf<(typeof schema)['minItems']>().toBeNever();
            });
        });

        test('methods', () => {
            const schema = tupleSchema()
                .minContains(0)
                .maxContains(2)
                .uniqueItems(true)
                .prefixItem(stringSchema().endsWith('c'))
                .prefixItem(stringSchema().endsWith('d'))
                .prependPrefixItem(stringSchema().endsWith('b'))
                .contains(stringSchema().startsWith('ab'));

            expectTypeOf<
                Parameters<(typeof schema)['contains']>[1]
            >().toBeNever();

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                [`${string}b`, `${string}c`, `${string}d`]
            >();

            expect(schema.toJSON()).to.deep.equal({
                type: 'array',
                uniqueItems: true,
                minContains: 0,
                maxContains: 2,
                maxItems: 3,
                minItems: 3,
                items: false,
                contains: {
                    pattern: '^ab',
                    type: 'string',
                },
                prefixItems: [
                    {
                        type: 'string',
                        pattern: 'b$',
                    },
                    {
                        type: 'string',
                        pattern: 'c$',
                    },
                    {
                        type: 'string',
                        pattern: 'd$',
                    },
                ],
            });

            const validator = new Ajv({ strict: true }).compile(
                schema.toJSON()
            );
            expect(validator(['ab', 'xc', 'xd'])).to.equal(true);
            // Second tuple is invalid
            expect(validator(['ab', 'xx', 'xd'])).to.equal(false);
            // Contains > 2
            expect(validator(['ab', 'abc', 'abd'])).to.equal(false);
            // Min Items < 3
            expect(validator(['ab', 'xc'])).to.equal(false);
            // Max Items > 3
            expect(validator(['ab', 'xc', 'xd', 'xx'])).to.equal(false);

            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'array',
                uniqueItems: true,
                maxItems: 3,
                minItems: 3,
                items: {
                    anyOf: [
                        {
                            type: 'string',
                            pattern: 'b$',
                        },
                        {
                            type: 'string',
                            pattern: 'c$',
                        },
                        {
                            type: 'string',
                            pattern: 'd$',
                        },
                    ],
                },
            });
            expect(
                schema.minContains(2).toJSON({ openApi30: true })
            ).to.deep.equal(schema.toJSON({ openApi30: true }));

            const oaValidator = new Ajv({ strict: true }).compile(
                schema.toJSON({ openApi30: true })
            );
            expect(oaValidator(['ab', 'xc', 'xd'])).to.equal(true);
            // Tuple order not enforced
            expect(oaValidator(['ab', 'xd', 'xc'])).to.equal(true);
            // Tuple existence not enforced
            expect(oaValidator(['ab', 'xc', 'c'])).to.equal(true);
            // Second tuple is invalid
            expect(oaValidator(['ab', 'xx', 'xd'])).to.equal(false);
            // Contains not enforced
            expect(oaValidator(['ab', 'abc', 'abd'])).to.equal(true);
            // Min Items < 3
            expect(oaValidator(['ab', 'xc'])).to.equal(false);
            // Max Items > 3
            expect(oaValidator(['ab', 'xc', 'xd', 'xx'])).to.equal(false);
        });

        test('Unset options', () => {
            const schema = tupleSchema({
                minContains: 4,
                maxContains: 5,
                uniqueItems: true,
            })
                .minContains(1)
                .maxContains(Number.POSITIVE_INFINITY)
                .uniqueItems(false);

            expect(schema.toJSON()).to.deep.equal({
                type: 'array',
                items: false,
                maxItems: 0,
            });
        });
    });

    suite('not', () => {
        test('Unsets nullable', () => {
            const baseSchema = tupleSchema();
            expectTypeOf<SchemaType<typeof baseSchema>>().toEqualTypeOf<[]>();

            const nullableSchema = baseSchema.nullable();
            expectTypeOf<SchemaType<typeof nullableSchema>>().toEqualTypeOf<
                [] | null
            >();

            const stillNullableSchema = nullableSchema.not(
                tupleSchema().prefixItem(stringSchema()).minContains(5)
            );
            expectTypeOf<
                SchemaType<typeof stillNullableSchema>
            >().toEqualTypeOf<[] | null>();

            expect(stillNullableSchema.toJSON()).to.deep.equal({
                type: ['array', 'null'],
                items: false,
                maxItems: 0,
                not: {
                    type: 'array',
                    items: false,
                    maxItems: 1,
                    minItems: 1,
                    prefixItems: [
                        {
                            type: 'string',
                        },
                    ],
                },
            });
            expect(
                stillNullableSchema.toJSON({ openApi30: true })
            ).to.deep.equal({
                type: 'array',
                nullable: true,
                items: { not: {} },
                maxItems: 0,
                not: {
                    type: 'array',
                    maxItems: 1,
                    minItems: 1,
                    items: {
                        type: 'string',
                    },
                },
            });
            new Ajv({ strict: true }).compile(stillNullableSchema.toJSON());
            new Ajv({ strict: true }).compile(
                stillNullableSchema.toJSON({ openApi30: true })
            );

            const notNullableSchema = stillNullableSchema
                .not(arraySchema().items(stringSchema()).nullable())
                .not(
                    tupleSchema()
                        .prefixItem(stringSchema().startsWith('abc'))
                        .nullable()
                );
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                []
            >();

            expect(notNullableSchema.toJSON()).to.deep.equal({
                type: 'array',
                items: false,
                maxItems: 0,
                not: {
                    items: false,
                    maxItems: 1,
                    minItems: 1,
                    prefixItems: [
                        {
                            type: 'string',
                        },
                    ],
                },
                allOf: [
                    {
                        not: {
                            items: {
                                type: 'string',
                            },
                        },
                    },
                    {
                        not: {
                            items: false,
                            maxItems: 1,
                            minItems: 1,
                            prefixItems: [
                                {
                                    type: 'string',
                                    pattern: '^abc',
                                },
                            ],
                        },
                    },
                ],
            });
            expect(notNullableSchema.toJSON({ openApi30: true })).to.deep.equal(
                {
                    type: 'array',
                    items: { not: {} },
                    maxItems: 0,
                    not: {
                        maxItems: 1,
                        minItems: 1,
                        items: {
                            type: 'string',
                        },
                    },
                    allOf: [
                        {
                            not: {
                                items: {
                                    type: 'string',
                                },
                            },
                        },
                        {
                            not: {
                                maxItems: 1,
                                minItems: 1,
                                items: {
                                    type: 'string',
                                    pattern: '^abc',
                                },
                            },
                        },
                    ],
                }
            );
            new Ajv({ strict: true }).compile(notNullableSchema.toJSON());
            new Ajv({ strict: true }).compile(
                notNullableSchema.toJSON({ openApi30: true })
            );
        });
    });

    test('prefixItems', () => {
        const schema = tupleSchema().prependPrefixItem(stringSchema());

        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<[string]>();

        expect(schema.toJSON()).to.deep.equal({
            type: 'array',
            items: false,
            minItems: 1,
            maxItems: 1,
            prefixItems: [
                {
                    type: 'string',
                },
            ],
        });
        expect(schema.toJSON({ openApi30: true })).to.deep.equal({
            type: 'array',
            items: {
                type: 'string',
            },
            minItems: 1,
            maxItems: 1,
        });
    });

    suite('contains', () => {
        test('Extends any item', () => {
            const baseSchema = tupleSchema().prefixItem(
                stringSchema().startsWith('a')
            );
            baseSchema.contains(stringSchema());
        });
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            const schema = tupleSchema();

            expectTypeOf<(typeof schema)['items']>().toBeNever();
            expectTypeOf<(typeof schema)['maxItems']>().toBeNever();
            expectTypeOf<(typeof schema)['minItems']>().toBeNever();
        });

        test('Contains only set once', () => {
            tupleSchema()
                .prefixItem(stringSchema().endsWith('abc'))
                .contains(stringSchema().startsWith('abc'))
                // @ts-expect-error
                .contains(stringSchema().startsWith('abc'));
        });
    });
});

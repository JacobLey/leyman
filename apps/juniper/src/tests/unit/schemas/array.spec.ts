import DefaultAjv from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { defaultImport } from 'default-import';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-hookup';
import {
    arraySchema,
    neverSchema,
    type SchemaType,
    stringSchema,
} from 'juniper';

const Ajv = defaultImport(DefaultAjv);

suite('ArraySchema', () => {
    suite('keywords', () => {
        suite('options', () => {
            test('success', () => {
                const schema = arraySchema({
                    minItems: 4,
                    maxItems: 10,
                    minContains: 2,
                    maxContains: 5,
                    uniqueItems: true,
                }).toJSON();

                expect(schema).to.deep.equal({
                    type: 'array',
                    minItems: 4,
                    maxItems: 10,
                    uniqueItems: true,
                });
                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                    unknown[]
                >();
            });

            suite('With items', () => {
                test('With options', () => {
                    const schema = arraySchema({
                        items: stringSchema().contains('el').default('hello'),
                        description: '<description>',
                    });
                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                        `${string}el${string}`[]
                    >();
                    expectTypeOf<
                        Parameters<(typeof schema)['items']>[1]
                    >().toBeNever();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'array',
                        description: '<description>',
                        items: {
                            type: 'string',
                            pattern: 'el',
                            default: 'hello',
                        },
                    });
                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'array',
                        description: '<description>',
                        items: {
                            type: 'string',
                            pattern: 'el',
                            default: 'hello',
                        },
                    });
                });

                test('Only schema', () => {
                    const schema = arraySchema(
                        arraySchema(
                            stringSchema().contains('el').default('hello')
                        )
                    );
                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                        `${string}el${string}`[][]
                    >();
                    expectTypeOf<
                        Parameters<(typeof schema)['items']>[1]
                    >().toBeNever();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'array',
                        items: {
                            type: 'array',
                            items: {
                                type: 'string',
                                pattern: 'el',
                                default: 'hello',
                            },
                        },
                    });
                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'array',
                        items: {
                            type: 'array',
                            items: {
                                type: 'string',
                                pattern: 'el',
                                default: 'hello',
                            },
                        },
                    });
                });
            });
        });

        test('methods', () => {
            const schema = arraySchema()
                .minItems(2)
                .maxItems(10)
                .minContains(1)
                .maxContains(3)
                .items(arraySchema(stringSchema().startsWith('a')))
                .uniqueItems(true)
                .prefixItem(stringSchema().endsWith('c'))
                .prefixItem(stringSchema().endsWith('d'))
                .prependPrefixItem(arraySchema(stringSchema().endsWith('b')))
                .contains(arraySchema(stringSchema().startsWith('ab')));

            expectTypeOf<
                Parameters<(typeof schema)['contains']>[1]
            >().toBeNever();
            expectTypeOf<Parameters<(typeof schema)['items']>[1]>().toBeNever();

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                [
                    `${string}b`[],
                    `${string}c`,
                    `${string}d`,
                    ...`a${string}`[][],
                ]
            >();

            expect(schema.toJSON()).to.deep.equal({
                type: 'array',
                uniqueItems: true,
                maxContains: 3,
                maxItems: 10,
                minItems: 2,
                items: {
                    type: 'array',
                    items: {
                        type: 'string',
                        pattern: '^a',
                    },
                },
                contains: {
                    type: 'array',
                    items: {
                        pattern: '^ab',
                        type: 'string',
                    },
                },
                prefixItems: [
                    {
                        type: 'array',
                        items: {
                            type: 'string',
                            pattern: 'b$',
                        },
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

            const validator = new Ajv({
                strict: true,
                strictTuples: false,
            }).compile(schema.toJSON());
            expect(validator([['xb'], 'xc', 'xd', ['abc'], ['abbc']])).to.equal(
                true
            );
            // Not unique
            expect(validator([['xb'], 'xc', 'xd', ['abc'], ['abc']])).to.equal(
                false
            );
            // Contains < 2
            expect(validator([['xb'], 'xc', 'xd', ['ac']])).to.equal(false);
            // Contains > 3
            expect(
                validator([['ab'], 'xc', 'xd', ['abc'], ['abbc'], ['abbbc']])
            ).to.equal(false);
            // Prefix items
            expect(validator([['ab'], 'xd', 'xc', ['abc']])).to.equal(false);
            expect(validator([['ab'], 'xc'])).to.equal(true);
            // Min Items < 2
            expect(validator([['ab']])).to.equal(false);

            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'array',
                uniqueItems: true,
                maxItems: 10,
                minItems: 2,
                items: {
                    anyOf: [
                        {
                            type: 'array',
                            items: {
                                pattern: '^a',
                                type: 'string',
                            },
                        },
                        {
                            type: 'array',
                            items: {
                                type: 'string',
                                pattern: 'b$',
                            },
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
                schema.minItems(0).minContains(2).toJSON({ openApi30: true })
            ).to.deep.equal(schema.toJSON({ openApi30: true }));

            const oaValidator = new Ajv({ strict: true }).compile(
                schema.toJSON({ openApi30: true })
            );
            expect(validator([['xb'], 'xc', 'xd', ['abc'], ['abbc']])).to.equal(
                true
            );
            expect(
                oaValidator([['xb'], 'xc', 'xd', ['abc'], ['abc']])
            ).to.equal(false);
            // Contains not enforced
            expect(oaValidator([['xb'], 'xc', 'xd', ['ac']])).to.equal(true);
            // Contains not enforced
            expect(
                oaValidator([['ab'], 'xc', 'xd', ['abc'], ['abbc'], ['abbbc']])
            ).to.equal(true);
            // Prefix items not enforced
            expect(oaValidator([['ab'], 'xd', 'xc', ['abc']])).to.equal(true);
            expect(oaValidator([['ab'], 'xc'])).to.equal(true);
            expect(oaValidator([['ab']])).to.equal(false);
        });

        test('Unset options', () => {
            const schema = arraySchema({
                minItems: 4,
                maxItems: 10,
                minContains: 0,
                maxContains: 5,
                uniqueItems: true,
            })
                .minItems(0)
                .maxItems(Number.POSITIVE_INFINITY)
                .uniqueItems(false);

            expect(schema.toJSON()).to.deep.equal({
                type: 'array',
            });

            const withContains = schema.contains(arraySchema());

            expect(withContains.toJSON()).to.deep.equal({
                type: 'array',
                contains: {
                    type: 'array',
                },
                minContains: 0,
                maxContains: 5,
            });

            expect(
                withContains
                    .minContains(1)
                    .maxContains(Number.POSITIVE_INFINITY)
                    .toJSON()
            ).to.deep.equal({
                type: 'array',
                contains: {
                    type: 'array',
                },
            });
        });
    });

    suite('not', () => {
        test('Unsets nullable', () => {
            const baseSchema = arraySchema().items(neverSchema());
            expectTypeOf<SchemaType<typeof baseSchema>>().toEqualTypeOf<[]>();
            expectTypeOf<
                Parameters<(typeof baseSchema)['items']>[1]
            >().toBeNever();

            const nullableSchema = baseSchema.nullable();
            expectTypeOf<SchemaType<typeof nullableSchema>>().toEqualTypeOf<
                [] | null
            >();

            const stillNullableSchema = nullableSchema.not(arraySchema());
            expectTypeOf<
                SchemaType<typeof stillNullableSchema>
            >().toEqualTypeOf<[] | null>();

            const notNullableSchema = stillNullableSchema.not(
                arraySchema().nullable()
            );
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                []
            >();
        });
    });

    suite('prefixItems', () => {
        const schema = arraySchema().prefixItem(stringSchema());

        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
            [string, ...unknown[]]
        >();

        expect(schema.toJSON()).to.deep.equal({
            type: 'array',
            prefixItems: [
                {
                    type: 'string',
                },
            ],
        });
        expect(schema.toJSON({ openApi30: true })).to.deep.equal({
            type: 'array',
        });
    });

    suite('contains', () => {
        test('Extends any item', () => {
            const baseSchema = arraySchema();
            baseSchema.contains(arraySchema(stringSchema()));

            const itemsSchema = baseSchema.items(
                stringSchema().startsWith('a')
            );
            itemsSchema.contains(stringSchema().startsWith('ab'));

            const prefixSchema = itemsSchema.prefixItem(
                stringSchema().endsWith('d')
            );
            prefixSchema.contains(stringSchema().endsWith('cd'));
        });

        test('Omit min+max when missing contains', () => {
            const schema = arraySchema({
                maxContains: 5,
                minContains: 0,
            });

            expect(schema.toJSON()).to.deep.equal({
                type: 'array',
            });
            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'array',
            });

            const containsSchema = schema.contains(stringSchema().nullable());
            expectTypeOf<SchemaType<typeof containsSchema>>().toEqualTypeOf<
                unknown[]
            >();

            expect(containsSchema.toJSON()).to.deep.equal({
                type: 'array',
                contains: {
                    type: ['string', 'null'],
                },
                minContains: 0,
                maxContains: 5,
            });
            expect(containsSchema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'array',
            });
            expect(
                containsSchema.minContains(4).toJSON({ openApi30: true })
            ).to.deep.equal({
                type: 'array',
                minItems: 4,
            });
        });
    });

    suite('ref', () => {
        test('Applies defaults', () => {
            expect(
                arraySchema()
                    .contains(stringSchema())
                    .maxContains(3)
                    .minContains(0)
                    .maxItems(10)
                    .minItems(5)
                    .ref('/path/to/ref')
                    .maxContains(Number.POSITIVE_INFINITY)
                    .minContains(1)
                    .maxItems(Number.POSITIVE_INFINITY)
                    .minItems(0)
                    .toJSON()
            ).to.deep.equal({
                $ref: '/path/to/ref',
                maxContains: 1e308,
                minContains: 1,
                maxItems: 1e308,
                minItems: 0,
            });
        });
    });

    suite('Invalid types', () => {
        test('Contains only set once', () => {
            arraySchema()
                .contains(stringSchema())
                // @ts-expect-error
                .contains(stringSchema());
        });

        test('Items can only be set once', () => {
            arraySchema()
                .items(stringSchema())
                // @ts-expect-error
                .items(stringSchema());

            arraySchema({
                items: stringSchema(),
            })
                // @ts-expect-error
                .items(stringSchema());
        });
    });
});

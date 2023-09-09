import AjvDefault from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { defaultImport } from 'default-import';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-hookup';
import {
    type EmptyObject,
    numberSchema,
    objectSchema,
    type PatternProperties,
    type SchemaType,
    stringSchema,
} from 'juniper';

const Ajv = defaultImport(AjvDefault);

suite('ObjectSchema', () => {

    suite('keywords', () => {

        suite('options', () => {

            test('success', () => {

                const schema = objectSchema({
                    properties: {
                        foo: stringSchema().startsWith('abc'),
                        bar: numberSchema(),
                        baz: true,
                    },
                    required: ['foo'],
                    minProperties: 1,
                    maxProperties: 3,
                    additionalProperties: true,
                    unevaluatedProperties: false,
                });

                expect(schema.toJSON()).to.deep.equal({
                    type: 'object',
                    properties: {
                        foo: {
                            type: 'string',
                            pattern: '^abc',
                        },
                        bar: {
                            type: 'number',
                        },
                        baz: true,
                    },
                    required: ['foo'],
                    minProperties: 1,
                    maxProperties: 3,
                    additionalProperties: true,
                    unevaluatedProperties: false,
                });
                expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<Record<string, unknown> & {
                    foo: `abc${string}`;
                    bar?: number;
                    baz?: unknown;
                }>();
            });

            test('Only properties', () => {

                const schema = objectSchema({
                    properties: {
                        foo: stringSchema().startsWith('abc'),
                        bar: numberSchema(),
                        baz: false,
                    },
                }).toJSON();

                expect(schema).to.deep.equal({
                    type: 'object',
                    properties: {
                        foo: {
                            type: 'string',
                            pattern: '^abc',
                        },
                        bar: {
                            type: 'number',
                        },
                        baz: false,
                    },
                });

                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                    foo?: `abc${string}`;
                    bar?: number;
                    baz?: never;
                }>();
            });

            test('Only additionalProperties', () => {

                const schema = objectSchema({
                    additionalProperties: numberSchema(),
                }).toJSON();

                expect(schema).to.deep.equal({
                    type: 'object',
                    additionalProperties: { type: 'number' },
                });

                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<Record<string, number>>();
            });

            test('No options', () => {

                const schema = objectSchema().toJSON();

                expect(schema).to.deep.equal({
                    type: 'object',
                });

                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<EmptyObject>();
            });
        });

        suite('methods', () => {

            test('success', () => {

                const schema = objectSchema()
                    .minProperties(2)
                    .maxProperties(10)
                    .properties({
                        foo: stringSchema(),
                    })
                    .properties({
                        bar: numberSchema(),
                    })
                    .required('bar')
                    .required(['bar'])
                    .nullable()
                    .additionalProperties(objectSchema({
                        properties: {
                            x: numberSchema(),
                        },
                        required: ['x'],
                    }).unevaluatedProperties(false))
                    .patternProperties(
                        '^abc' as PatternProperties<`abc${string}`>,
                        objectSchema().nullable().additionalProperties(false)
                    ).patternProperties(
                        'abc$' as PatternProperties<`${string}abc`>,
                        numberSchema({ type: 'integer' }).cast<1 | 2>()
                    )
                    .unevaluatedProperties(true);

                expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<
                    Record<`${string}abc`, 1 | 2> &
                    Record<`abc${string}`, EmptyObject | null> &
                    Record<string, { x: number }> & {
                        foo?: string;
                        bar: number;
                    } | null
                >();

                const example = {} as unknown as NonNullable<SchemaType<typeof schema>>;
                expectTypeOf(example.bar).toEqualTypeOf<number>();
                expectTypeOf(example.foo).toEqualTypeOf<string | undefined>();
                expectTypeOf(example.aaabc).toEqualTypeOf<1 | 2 | undefined>();
                expectTypeOf(example.abccc).toEqualTypeOf<EmptyObject | null | undefined>();
                expectTypeOf(example.abc).toEqualTypeOf<((1 | 2) & (EmptyObject | null)) | undefined>();
                expectTypeOf(example.random).toMatchTypeOf<{ x: number } | undefined>();

                expect(schema.toJSON()).to.deep.equal({
                    type: ['object', 'null'],
                    properties: {
                        bar: {
                            type: 'number',
                        },
                        foo: {
                            type: 'string',
                        },
                    },
                    additionalProperties: {
                        properties: {
                            x: {
                                type: 'number',
                            },
                        },
                        required: ['x'],
                        type: 'object',
                        unevaluatedProperties: false,
                    },
                    patternProperties: {
                        '^abc': {
                            type: ['object', 'null'],
                            additionalProperties: false,
                        },
                        'abc$': {
                            type: 'integer',
                        },
                    },
                    maxProperties: 10,
                    minProperties: 2,
                    required: ['bar'],
                    unevaluatedProperties: true,
                });

                const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                expect(validator({
                    bar: 123,
                    aaabc: 1,
                    abccc: {},
                    random: { x: -5 },
                })).to.equal(true);
                expect(validator({})).to.equal(false);
                expect(validator(null)).to.equal(true);
                expect(validator({
                    bar: 123,
                    abc: 1,
                })).to.equal(false);
                expect(validator({
                    bar: 123,
                    abc: null,
                })).to.equal(false);
                expect(validator({
                    bar: 123,
                    foo: '<foo>',
                })).to.equal(true);

                expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'object',
                    nullable: true,
                    properties: {
                        bar: {
                            type: 'number',
                        },
                        foo: {
                            type: 'string',
                        },
                    },
                    additionalProperties: {
                        properties: {
                            x: {
                                type: 'number',
                            },
                        },
                        required: ['x'],
                        type: 'object',
                    },
                    maxProperties: 10,
                    minProperties: 2,
                    required: ['bar'],
                });
            });

            test('Unset options', () => {

                const schema = objectSchema({
                    minProperties: 4,
                    maxProperties: 99,
                    additionalProperties: numberSchema(),
                })
                    .minProperties(0)
                    .maxProperties(Number.POSITIVE_INFINITY)
                    .additionalProperties(false);

                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<EmptyObject>();

                expect(schema.toJSON()).to.deep.equal({
                    type: 'object',
                    additionalProperties: false,
                });
            });
        });
    });

    suite('if', () => {

        test('Then + else', () => {

            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            }).if(
                objectSchema({
                    properties: {
                        bar: stringSchema(),
                    },
                    required: ['bar'],
                }),
                {
                    then: objectSchema({
                        properties: {
                            baz: numberSchema(),
                        },
                    }).patternProperties(
                        'xyz' as PatternProperties<`a${string}`>,
                        numberSchema()
                    ),
                    else: objectSchema({
                        additionalProperties: true,
                    }),
                }
            );

            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<{
                foo?: number;
            } & (Record<string, unknown> | (Record<`a${string}`, number> & {
                bar: string;
                baz?: number;
            }))>();
        });

        test('Only then', () => {

            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            }).if(
                objectSchema({
                    properties: {
                        bar: stringSchema(),
                    },
                    required: ['bar'],
                }),
                {
                    then: objectSchema({
                        properties: {
                            baz: numberSchema(),
                        },
                    }),
                }
            );

            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<{
                foo?: number;
                bar: string;
                baz?: number;
            } | {
                foo?: number;
            }>();
        });

        test('Only else', () => {

            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            }).if(
                objectSchema({
                    properties: {
                        bar: stringSchema(),
                    },
                    required: ['bar'],
                }).nullable(),
                {
                    else: objectSchema({
                        properties: {
                            baz: numberSchema(),
                        },
                    }),
                }
            ).nullable();

            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<{
                foo?: number;
            } & ({
                bar: string;
            } | {
                baz?: number;
            })>();
        });
    });

    suite('not', () => {

        test('Unsets nullable', () => {

            const baseSchema = objectSchema({
                properties: {
                    x: stringSchema(),
                },
            });
            expectTypeOf<SchemaType<typeof baseSchema>>().toEqualTypeOf<{ x?: string }>();

            const nullableSchema = baseSchema.nullable().required(['x']);
            expectTypeOf<SchemaType<typeof nullableSchema>>().toMatchTypeOf<{ x: string } | null>();

            const stillNullableSchema = nullableSchema.not(objectSchema());
            expectTypeOf<SchemaType<typeof stillNullableSchema>>().toMatchTypeOf<{ x: string } | null>();

            const notNullableSchema = stillNullableSchema.not(objectSchema().nullable());
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toMatchTypeOf<{ x: string }>();
        });
    });

    suite('ref', () => {

        test('Applies defaults', () => {

            expect(
                objectSchema()
                    .maxProperties(4)
                    .minProperties(2)
                    .ref('/path/to/ref')
                    .maxProperties(Number.POSITIVE_INFINITY)
                    .minProperties(0)
                    .toJSON()
            ).to.deep.equal({
                $ref: '/path/to/ref',
                maxProperties: 1e308,
                minProperties: 0,
            });
        });
    });

    suite('patternProperties', () => {

        test('success', () => {

            const strSchema = stringSchema();

            const schema = objectSchema()
                .patternProperties(
                    'a' as PatternProperties<`${string}a${string}`>,
                    numberSchema()
                ).patternProperties(
                    'b' as PatternProperties<`${string}b${string}`>,
                    true
                ).patternProperties(
                    'c' as PatternProperties<`${string}c${string}`>,
                    false
                ).patternProperties(
                    // Overwrites
                    'a' as PatternProperties<`${string}abc${string}`>,
                    strSchema
                );
            const withSubSchema = schema.allOf(
                objectSchema({ additionalProperties: false })
                    .patternProperties(
                        'b' as PatternProperties<`${string}b${string}`>,
                        false
                    )
                    .patternProperties(
                        'c' as PatternProperties<`${string}c${string}`>,
                        true
                    ).patternProperties(
                        'a' as PatternProperties<`${string}abc${string}`>,
                        strSchema
                    )
            );

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                Record<`${string}a${string}`, number> &
                Record<`${string}abc${string}`, string> &
                Record<`${string}b${string}`, unknown> &
                Record<`${string}c${string}`, never>
            >();
            expectTypeOf<SchemaType<typeof withSubSchema>>().toMatchTypeOf<
                Record<`${string}a${string}`, number> &
                Record<`${string}abc${string}`, string> &
                Record<`${string}b${string}`, never> &
                Record<`${string}c${string}`, never>
            >();

            expect(schema.toJSON()).to.deep.equal({
                type: 'object',
                patternProperties: {
                    a: { type: 'string' },
                    b: true,
                    c: false,
                },
            });
            expect(withSubSchema.toJSON()).to.deep.equal({
                type: 'object',
                patternProperties: {
                    a: { type: 'string' },
                    b: true,
                    c: false,
                },
                allOf: [
                    {
                        additionalProperties: false,
                        patternProperties: {
                            a: { type: 'string' },
                            b: false,
                            c: true,
                        },
                    },
                ],
            });

            const validator = new Ajv({ strict: true }).compile(schema.toJSON());
            const subSchemaValidator = new Ajv({ strict: true }).compile(withSubSchema.toJSON());
            for (const [test, expected, subSchemaExpected] of [
                [{}, true, true],
                [
                    { a: 'foobar' },
                    true,
                    true,
                ],
                [
                    { b: [null] },
                    true,
                    false,
                ],
                [
                    { c: [null] },
                    false,
                    false,
                ],
                [
                    { ab: 'foobar' },
                    true,
                    false,
                ],
                [
                    { ab: [null] },
                    false,
                    false,
                ],
                [
                    { abc: 'xyz' },
                    false,
                    false,
                ],
                [
                    { z: true },
                    true,
                    false,
                ],
            ] as const) {
                expect(validator(test)).to.equal(expected);
                expect(subSchemaValidator(test)).to.equal(subSchemaExpected);
            }
        });
    });

    suite('dependentRequired', () => {

        test('success', () => {

            const schema = objectSchema({
                properties: {
                    a: numberSchema(),
                    b: numberSchema(),
                    c: numberSchema(),
                    d: numberSchema(),
                },
                required: ['c', 'd'],
            }).dependentRequired('a', ['b', 'c']);
            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<({
                a?: number;
                b?: number;
                c: number;
                d: number;
            }) & (
                { a?: never } |
                { b: number; c: number }
            )>();

            expect(schema.toJSON()).to.deep.equal({
                type: 'object',
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                    d: { type: 'number' },
                },
                required: ['c', 'd'],
                dependentRequired: {
                    a: ['b', 'c'],
                },
            });
            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'object',
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                    d: { type: 'number' },
                },
                required: ['c', 'd'],
                anyOf: [
                    { not: { required: ['a'] } },
                    { required: ['b', 'c'] },
                ],
            });

            const validator = new Ajv({ strict: true }).compile(schema.toJSON());
            const oaValidator = new Ajv({
                strict: true,
                strictRequired: false,
            }).compile(schema.toJSON({ openApi30: true }));
            for (const [test, expected] of [
                [null, false],
                [
                    {
                        c: 3,
                        d: 4,
                    },
                    true,
                ],
                [
                    {
                        b: 2,
                        c: 3,
                        d: 4,
                    },
                    true,
                ],
                [
                    {
                        a: 1,
                        b: 2,
                        c: 3,
                        d: 4,
                    },
                    true,
                ],
                [
                    {
                        a: 1,
                        c: 3,
                        d: 4,
                    },
                    false,
                ],
            ] as const) {
                expect(validator(test)).to.equal(expected);
                expect(oaValidator(test)).to.equal(expected);
            }

            const example = {} as unknown as SchemaType<typeof schema>;

            expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.c).toEqualTypeOf<number>();
            expectTypeOf(example.d).toEqualTypeOf<number>();

            if (typeof example.a === 'number') {
                expectTypeOf(example.a).toEqualTypeOf<number>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
            } else {
                expectTypeOf(example.a).toEqualTypeOf<undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
            }

            if (example.a) {
                expectTypeOf(example.a).toEqualTypeOf<number>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
            } else {
                expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
            }

            if (typeof example.b === 'number') {
                expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
            } else {
                expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.b).toEqualTypeOf<undefined>();
            }

            const withIfSchema = schema.if(
                objectSchema({
                    properties: {
                        a: numberSchema().minimum({ exclusive: false, value: 10 }),
                    },
                }),
                {
                    then: objectSchema({
                        properties: {
                            a: numberSchema({ type: 'integer' }),
                        },
                    }),
                }
            );

            expect(withIfSchema.toJSON()).to.deep.equal({
                type: 'object',
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                    d: { type: 'number' },
                },
                required: ['c', 'd'],
                dependentRequired: {
                    a: ['b', 'c'],
                },
                allOf: [
                    {
                        if: {
                            properties: {
                                a: {
                                    type: 'number',
                                    minimum: 10,
                                },
                            },
                        },
                        then: {
                            properties: {
                                a: { type: 'integer' },
                            },
                        },
                    },
                ],
            });
            expect(withIfSchema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'object',
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                    d: { type: 'number' },
                },
                required: ['c', 'd'],
                anyOf: [
                    {
                        not: {
                            properties: {
                                a: {
                                    type: 'number',
                                    minimum: 10,
                                },
                            },
                        },
                    },
                    {
                        properties: {
                            a: { type: 'integer' },
                        },
                    },
                ],
                allOf: [
                    {
                        anyOf: [
                            { not: { required: ['a'] } },
                            { required: ['b', 'c'] },
                        ],
                    },
                ],
            });

            new Ajv({ strict: true, strictRequired: false }).compile(withIfSchema.toJSON());
            new Ajv({ strict: true, strictRequired: false }).compile(withIfSchema.toJSON({ openApi30: true }));
        });
    });

    suite('dependentSchemas', () => {

        test('success', () => {

            const schema = objectSchema({
                properties: {
                    a: numberSchema(),
                    b: numberSchema(),
                    c: numberSchema(),
                    d: numberSchema(),
                },
                required: ['c', 'd'],
            }).dependentSchemas(
                'a',
                objectSchema({
                    properties: {
                        b: numberSchema({ type: 'integer' }),
                        e: stringSchema(),
                    },
                    required: ['b'],
                }).nullable()
            ).nullable();
            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<(({
                a?: number;
                b?: number;
                c: number;
                d: number;
            }) & (
                { a?: never } |
                { b: number; e?: string }
            )) | null>();

            expect(schema.toJSON()).to.deep.equal({
                type: ['object', 'null'],
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                    d: { type: 'number' },
                },
                required: ['c', 'd'],
                dependentSchemas: {
                    a: {
                        properties: {
                            b: { type: 'integer' },
                            e: { type: 'string' },
                        },
                        required: ['b'],
                    },
                },
            });
            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'object',
                nullable: true,
                properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                    c: { type: 'number' },
                    d: { type: 'number' },
                },
                required: ['c', 'd'],
                anyOf: [
                    { not: { required: ['a'] } },
                    {
                        properties: {
                            b: { type: 'integer' },
                            e: { type: 'string' },
                        },
                        required: ['b'],
                    },
                ],
            });

            const validator = new Ajv({ strict: true }).compile(schema.toJSON());
            const oaValidator = new Ajv({
                strict: true,
                strictRequired: false,
            }).compile(schema.toJSON({ openApi30: true }));
            for (const [test, expected] of [
                [null, true],
                [
                    {
                        c: 3,
                        d: 4,
                    },
                    true,
                ],
                [
                    {
                        b: 2.5,
                        c: 3,
                        d: 4,
                    },
                    true,
                ],
                [
                    {
                        a: 1,
                        b: 2,
                        c: 3,
                        d: 4,
                        e: '5',
                    },
                    true,
                ],
                [
                    {
                        a: 1,
                        b: 2.5,
                        c: 3,
                        d: 4,
                    },
                    false,
                ],
                [
                    {
                        a: 1,
                        c: 3,
                        d: 4,
                        e: '5',
                    },
                    false,
                ],
            ] as const) {
                expect(validator(test)).to.equal(expected);
                expect(oaValidator(test)).to.equal(expected);
            }

            const example = {} as unknown as NonNullable<SchemaType<typeof schema>>;

            expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.c).toEqualTypeOf<number>();
            expectTypeOf(example.d).toEqualTypeOf<number>();
            // @ts-expect-error
            expectTypeOf(example.e);

            if (typeof example.a === 'number') {
                expectTypeOf(example.a).toEqualTypeOf<number>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
                expectTypeOf(example.e);
            } else {
                expectTypeOf(example.a).toEqualTypeOf<undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
            }

            if (example.a) {
                expectTypeOf(example.a).toEqualTypeOf<number>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
                expectTypeOf(example.e).toEqualTypeOf<string | undefined>();
            } else {
                expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.c).toEqualTypeOf<number>();
            }

            if ('e' in example) {
                expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
            }
        });
    });

    suite('composite', () => {

        test('allOf', () => {

            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            })
                .nullable()
                .allOf(
                    objectSchema({
                        properties: {
                            bar: stringSchema(),
                        },
                        required: ['bar'],
                    }).nullable()
                );

            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<{ foo?: number; bar: string } | null>();

            const notNullableSchema = schema.allOf(
                objectSchema().additionalProperties(stringSchema().startsWith('a'))
            );

            expectTypeOf<SchemaType<typeof notNullableSchema>>().toMatchTypeOf<
                Record<string, `a${string}`> & { foo?: number; bar: string }
            >();
        });

        test('anyOf', () => {

            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            })
                .anyOf([
                    objectSchema({
                        properties: {
                            bar: stringSchema(),
                        },
                        required: ['bar'],
                    }).nullable(),
                    objectSchema().patternProperties(
                        '^abc' as PatternProperties<`abc${string}`>,
                        objectSchema().nullable().additionalProperties(false)
                    ),
                ])
                .nullable();

            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<
                ({ foo?: number } & (Record<`abc${string}`, EmptyObject | null> | { bar: string })) | null
            >();

            const notNullableSchema = schema.anyOf([objectSchema()]);
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toMatchTypeOf<
                { foo?: number } & (Record<`abc${string}`, EmptyObject | null> | { bar: string })
            >();

            const neverSchema = schema.anyOf([]);

            expectTypeOf<SchemaType<typeof neverSchema>>().toEqualTypeOf<never>();

            const neverSchema2 = stringSchema().nullable().anyOf([]);
            expectTypeOf<SchemaType<typeof neverSchema2>>().toEqualTypeOf<never>();
        });

        test('oneOf', () => {

            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            })
                .oneOf([
                    objectSchema({
                        properties: {
                            bar: stringSchema(),
                        },
                        required: ['bar'],
                    }).nullable(),
                    objectSchema().patternProperties(
                        '^abc' as PatternProperties<`abc${string}`>,
                        objectSchema().nullable().additionalProperties(false)
                    ),
                ])
                .nullable();

            expectTypeOf<SchemaType<typeof schema>>().toMatchTypeOf<
                ({ foo?: number } & (Record<`abc${string}`, EmptyObject | null> | { bar: string })) | null
            >();

            const notNullableSchema = schema.oneOf([objectSchema()]);
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toMatchTypeOf<
                { foo?: number } & (Record<`abc${string}`, EmptyObject | null> | { bar: string })
            >();

            const neverSchema = schema.oneOf([]);

            expectTypeOf<SchemaType<typeof neverSchema>>().toEqualTypeOf<never>();

            const neverSchema2 = stringSchema().nullable().oneOf([]);
            expectTypeOf<SchemaType<typeof neverSchema2>>().toEqualTypeOf<never>();
        });
    });

    suite('Invalid types', () => {

        suite('Required not exists', () => {

            test('create', () => {
                objectSchema({
                    // @ts-expect-error
                    required: ['foo'],
                });

                objectSchema({
                    properties: {
                        foo: numberSchema(),
                        bar: numberSchema(),
                    },
                    // @ts-expect-error
                    required: ['foo', 'foo2'],
                });
            });

            test('method', () => {

                // @ts-expect-error
                objectSchema().required('foo');

                // @ts-expect-error
                objectSchema().required(['foo']);

                objectSchema({
                    properties: {
                        foo: numberSchema(),
                        bar: numberSchema(),
                    },
                // @ts-expect-error
                }).required(['foo', 'foo2']);

                objectSchema({
                    properties: {
                        foo: numberSchema(),
                        bar: numberSchema(),
                    },
                // @ts-expect-error
                }).required('foo2');
            });
        });

        test('Property already exists', () => {

            objectSchema({
                properties: {
                    foo: numberSchema(),
                    bar: numberSchema(),
                },
            // @ts-expect-error
            }).properties({
                foo: numberSchema(),
            });

            objectSchema().properties({
                foo: numberSchema(),
                bar: numberSchema(),
            // @ts-expect-error
            }).properties({
                foo: numberSchema(),
                foo2: numberSchema(),
            });
        });
    });
});

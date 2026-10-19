// Asserting `PatternProperties` is what types the pattern, even though a plain string is accepted
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import type { EmptyObject, PatternProperties, SchemaType } from 'juniper';
import type { Flatten } from '../../types.js';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { enumSchema, numberSchema, objectSchema, stringSchema } from 'juniper';
import { suite, test } from 'mocha-chain';
import { compile } from '../../ajv.js';

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
                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                    [x: string]: unknown;
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
                    .additionalProperties(
                        objectSchema({
                            properties: {
                                x: numberSchema(),
                            },
                            required: ['x'],
                        }).unevaluatedProperties(false)
                    )
                    .patternProperties(
                        '^abc' as PatternProperties<`abc${string}`>,
                        objectSchema().nullable().additionalProperties(false)
                    )
                    .patternProperties(
                        'abc$' as PatternProperties<`${string}abc`>,
                        numberSchema({ type: 'integer' }).cast<1 | 2>()
                    )
                    .unevaluatedProperties(true);

                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<Flatten<
                    Record<`${string}abc`, 1 | 2> &
                        Record<`abc${string}`, EmptyObject | null> &
                        Record<string, { x: number }> & {
                            bar: number;
                            foo?: string;
                        }
                > | null>();

                const example = {} as unknown as NonNullable<SchemaType<typeof schema>>;
                expectTypeOf(example.bar).toEqualTypeOf<number>();
                expectTypeOf(example.foo).toEqualTypeOf<string | undefined>();
                expectTypeOf(example.aaabc).toEqualTypeOf<1 | 2 | undefined>();
                expectTypeOf(example.abccc).toEqualTypeOf<EmptyObject | null | undefined>();
                expectTypeOf(example.abc).toEqualTypeOf<
                    ((1 | 2) & (EmptyObject | null)) | undefined
                >();
                expectTypeOf(example.random).toEqualTypeOf<{ x: number } | undefined>();

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
                        abc$: {
                            type: 'integer',
                        },
                    },
                    maxProperties: 10,
                    minProperties: 2,
                    required: ['bar'],
                    unevaluatedProperties: true,
                });

                const validator = compile(schema.toJSON());
                expect(
                    validator({
                        bar: 123,
                        aaabc: 1,
                        abccc: {},
                        random: { x: -5 },
                    })
                ).to.equal(true);
                expect(validator({})).to.equal(false);
                expect(validator(null)).to.equal(true);
                expect(
                    validator({
                        bar: 123,
                        abc: 1,
                    })
                ).to.equal(false);
                expect(
                    validator({
                        bar: 123,
                        abc: null,
                    })
                ).to.equal(false);
                expect(
                    validator({
                        bar: 123,
                        foo: '<foo>',
                    })
                ).to.equal(true);

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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                    // eslint-disable-next-line unicorn/no-thenable
                    then: objectSchema({
                        properties: {
                            baz: numberSchema(),
                        },
                    }).patternProperties('xyz' as PatternProperties<`a${string}`>, numberSchema()),
                    else: objectSchema({
                        additionalProperties: true,
                    }),
                }
            );

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | {
                      [x: `a${string}`]: number;
                      bar: string;
                      baz?: number;
                      foo?: number;
                  }
                | {
                      foo?: number;
                  }
            >();
        });

        test('Only then', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                    // eslint-disable-next-line unicorn/no-thenable
                    then: objectSchema({
                        properties: {
                            baz: numberSchema(),
                        },
                    }),
                }
            );

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | {
                      bar: string;
                      baz?: number;
                      foo?: number;
                  }
                | {
                      foo?: number;
                  }
            >();
        });

        test('Only else', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const schema = objectSchema({
                properties: {
                    foo: numberSchema(),
                },
            })
                .if(
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
                )
                .nullable();

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | {
                      bar: string;
                      foo?: number;
                  }
                | {
                      baz?: number;
                      foo?: number;
                  }
            >();
        });
    });

    suite('not', () => {
        test('Unsets nullable', () => {
            const baseSchema = objectSchema({
                properties: {
                    x: stringSchema(),
                },
            });
            expectTypeOf<SchemaType<typeof baseSchema>>().toEqualTypeOf<{
                x?: string;
            }>();

            const nullableSchema = baseSchema.nullable().required(['x']);
            expectTypeOf<SchemaType<typeof nullableSchema>>().toEqualTypeOf<{
                x: string;
            } | null>();

            const stillNullableSchema = nullableSchema.not(objectSchema());
            expectTypeOf<SchemaType<typeof stillNullableSchema>>().toEqualTypeOf<{
                x: string;
            } | null>();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const notNullableSchema = stillNullableSchema.not(objectSchema().nullable());
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<{
                x: string;
            }>();
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
                .patternProperties('a' as PatternProperties<`${string}a${string}`>, numberSchema())
                .patternProperties('b' as PatternProperties<`${string}b${string}`>, true)
                .patternProperties('c' as PatternProperties<`${string}c${string}`>, false)
                .patternProperties(
                    // Overwrites
                    'a' as PatternProperties<`${string}abc${string}`>,
                    strSchema
                );
            const withSubSchema = schema.allOf(
                objectSchema({ additionalProperties: false })
                    .patternProperties('b' as PatternProperties<`${string}b${string}`>, false)
                    .patternProperties('c' as PatternProperties<`${string}c${string}`>, true)
                    .patternProperties('a' as PatternProperties<`${string}abc${string}`>, strSchema)
            );

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                [x: `${string}a${string}`]: number;
                // Also matches `a` and `c`
                [x: `${string}abc${string}`]: never;
                [x: `${string}b${string}`]: unknown;
                [x: `${string}c${string}`]: never;
            }>();
            expectTypeOf<SchemaType<typeof withSubSchema>>().toEqualTypeOf<{
                [x: `${string}a${string}`]: number;
                [x: `${string}abc${string}`]: never;
                [x: `${string}b${string}`]: never;
                [x: `${string}c${string}`]: never;
            }>();

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

            const validator = compile(schema.toJSON());
            const subSchemaValidator = compile(withSubSchema.toJSON());
            for (const [val, expected, subSchemaExpected] of [
                [{}, true, true],
                [{ a: 'foobar' }, true, true],
                [{ b: [null] }, true, false],
                [{ c: [null] }, false, false],
                [{ ab: 'foobar' }, true, false],
                [{ ab: [null] }, false, false],
                [{ abc: 'xyz' }, false, false],
                [{ z: true }, true, false],
            ] as const) {
                expect(validator(val)).to.equal(expected);
                expect(subSchemaValidator(val)).to.equal(subSchemaExpected);
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
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | { a?: never; b?: number; c: number; d: number }
                | { a?: number; b: number; c: number; d: number }
            >();

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
                anyOf: [{ not: { required: ['a'] } }, { required: ['b', 'c'] }],
            });

            const validator = compile(schema.toJSON());
            const oaValidator = compile(schema.toJSON({ openApi30: true }), {
                strict: true,
                strictRequired: false,
            });
            for (const [val, expected] of [
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
                expect(validator(val)).to.equal(expected);
                expect(oaValidator(val)).to.equal(expected);
            }

            const example = {} as unknown as SchemaType<typeof schema>;

            expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.c).toEqualTypeOf<number>();
            expectTypeOf(example.d).toEqualTypeOf<number>();

            if (typeof example.a === 'number') {
                expectTypeOf(example.a).toEqualTypeOf<number>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
            } else {
                expectTypeOf(example.a).toEqualTypeOf<undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
            }
            expectTypeOf(example.c).toEqualTypeOf<number>();

            if (example.a) {
                expectTypeOf(example.a).toEqualTypeOf<number>();
                expectTypeOf(example.b).toEqualTypeOf<number>();
            } else {
                expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
                expectTypeOf(example.b).toEqualTypeOf<number | undefined>();
            }
            expectTypeOf(example.c).toEqualTypeOf<number>();

            expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
            if (typeof example.b === 'number') {
                expectTypeOf(example.b).toEqualTypeOf<number>();
            } else {
                expectTypeOf(example.b).toEqualTypeOf<undefined>();
            }

            const withIfSchema = schema.if(
                objectSchema({
                    properties: {
                        a: numberSchema().minimum({
                            exclusive: false,
                            value: 10,
                        }),
                    },
                }),
                {
                    // eslint-disable-next-line unicorn/no-thenable
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
                        // eslint-disable-next-line unicorn/no-thenable
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
                        anyOf: [{ not: { required: ['a'] } }, { required: ['b', 'c'] }],
                    },
                ],
            });

            compile(withIfSchema.toJSON(), { strict: true, strictRequired: false });
            compile(withIfSchema.toJSON({ openApi30: true }), {
                strict: true,
                strictRequired: false,
            });
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
            })
                .dependentSchemas(
                    'a',
                    objectSchema({
                        properties: {
                            b: numberSchema({ type: 'integer' }),
                            e: stringSchema(),
                        },
                        required: ['b'],
                    }).nullable()
                )
                .nullable();
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | { a?: never; b?: number; c: number; d: number }
                | { a?: number; b: number; c: number; d: number; e?: string }
                | null
            >();

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

            const validator = compile(schema.toJSON());
            const oaValidator = compile(schema.toJSON({ openApi30: true }), {
                strict: true,
                strictRequired: false,
            });
            for (const [val, expected] of [
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
                expect(validator(val)).to.equal(expected);
                expect(oaValidator(val)).to.equal(expected);
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

            if (!('e' in example)) {
                return;
            }

            expectTypeOf(example.a).toEqualTypeOf<number | undefined>();
            expectTypeOf(example.b).toEqualTypeOf<number>();
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

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                foo?: number;
                bar: string;
            } | null>();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const notNullableSchema = schema.allOf(
                objectSchema().additionalProperties(stringSchema().startsWith('a'))
            );

            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                Flatten<Record<string, `a${string}`> & { foo?: number; bar: string }>
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

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | { [x: `abc${string}`]: EmptyObject | null; foo?: number }
                | { bar: string; foo?: number }
                | null
            >();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const notNullableSchema = schema.anyOf([objectSchema()]);
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                | { [x: `abc${string}`]: EmptyObject | null; foo?: number }
                | { bar: string; foo?: number }
            >();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const neverSchema = schema.anyOf([]);

            expectTypeOf<SchemaType<typeof neverSchema>>().toEqualTypeOf<never>();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                | { [x: `abc${string}`]: EmptyObject | null; foo?: number }
                | { bar: string; foo?: number }
                | null
            >();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const notNullableSchema = schema.oneOf([objectSchema()]);
            expectTypeOf<SchemaType<typeof notNullableSchema>>().toEqualTypeOf<
                | { [x: `abc${string}`]: EmptyObject | null; foo?: number }
                | { bar: string; foo?: number }
            >();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const neverSchema = schema.oneOf([]);

            expectTypeOf<SchemaType<typeof neverSchema>>().toEqualTypeOf<never>();

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const neverSchema2 = stringSchema().nullable().oneOf([]);
            expectTypeOf<SchemaType<typeof neverSchema2>>().toEqualTypeOf<never>();
        });
    });

    test('OpenAPI 3.0 uses object schemas for true and false properties', () => {
        const schema = objectSchema({ properties: { anything: true, nothing: false } });
        expect(schema.toJSON({ openApi30: true })).to.deep.equal({
            type: 'object',
            properties: { anything: {}, nothing: { not: {} } },
        });
        expect(schema.toJSON()).to.deep.equal({
            type: 'object',
            properties: { anything: true, nothing: false },
        });
    });

    suite('pick, omit and partial', () => {
        const user = objectSchema({
            title: 'User',
            properties: {
                id: numberSchema(),
                name: stringSchema(),
                email: stringSchema(),
            },
            required: ['id', 'name'],
            additionalProperties: false,
        });

        test('pick', () => {
            const schema = user.pick(['id', 'email']);

            expect(schema.toJSON()).to.deep.equal({
                title: 'User',
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    email: { type: 'string' },
                },
                required: ['id'],
                additionalProperties: false,
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                id: number;
                email?: string;
            }>();

            const validator = compile(schema.toJSON());
            expect(validator({ id: 1 })).to.equal(true);
            expect(validator({ id: 1, name: 'name' })).to.equal(false);
        });

        test('omit', () => {
            const schema = user.omit(['id']);

            expect(schema.toJSON()).to.deep.equal({
                title: 'User',
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                },
                required: ['name'],
                additionalProperties: false,
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                name: string;
                email?: string;
            }>();
        });

        test('partial', () => {
            const all = user.partial();
            expect(all.toJSON()).to.not.have.property('required');
            expectTypeOf<SchemaType<typeof all>>().toEqualTypeOf<{
                id?: number;
                name?: string;
                email?: string;
            }>();

            const some = user.partial(['name']);
            expect(some.toJSON()).to.have.property('required').that.deep.equals(['id']);
            expectTypeOf<SchemaType<typeof some>>().toEqualTypeOf<{
                id: number;
                name?: string;
                email?: string;
            }>();
        });

        test('Does not change the original', () => {
            user.pick(['id']);
            user.omit(['id']);
            user.partial();
            expect(user.toJSON()).to.have.property('required').that.deep.equals(['id', 'name']);
            expect(Object.keys(user.toJSON().properties!)).to.deep.equal(['id', 'name', 'email']);
        });

        test('Keeps nullable', () => {
            const schema = user.nullable().pick(['id']);
            expect(schema.toJSON()).to.have.property('type').that.deep.equals(['object', 'null']);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                id: number;
            } | null>();
        });

        test('Constraints from combined schemas still apply', () => {
            const schema = user.dependentRequired('email', ['name']).omit(['name']).partial();

            expect(schema.toJSON()).to.deep.equal({
                title: 'User',
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    email: { type: 'string' },
                },
                additionalProperties: false,
                dependentRequired: { email: ['name'] },
            });
            expectTypeOf<SchemaType<typeof schema>>().toExtend<
                { email?: undefined } | { name: string }
            >();
        });

        test('Rejects unknown properties', () => {
            // @ts-expect-error
            user.pick(['other']);
            // @ts-expect-error
            user.omit(['other']);
            // @ts-expect-error
            user.partial(['other']);
        });

        test('required() makes every property required', () => {
            const schema = user.partial().required();

            expect(schema.toJSON())
                .to.have.property('required')
                .that.deep.equals(['id', 'name', 'email']);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                id: number;
                name: string;
                email: string;
            }>();
        });

        test('required() leaves forbidden properties optional', () => {
            const schema = user.properties({ secret: false }).required();

            expect(schema.toJSON())
                .to.have.property('required')
                .that.deep.equals(['id', 'name', 'email']);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                id: number;
                name: string;
                email: string;
                secret?: never;
            }>();
        });
    });

    suite('extend', () => {
        const timestamps = objectSchema({
            properties: {
                createdAt: stringSchema(),
                updatedAt: stringSchema(),
            },
            required: ['createdAt'],
        });
        const user = objectSchema({
            title: 'User',
            properties: {
                id: numberSchema(),
                name: stringSchema(),
            },
            required: ['id'],
            additionalProperties: false,
        });

        test('Combines properties and required', () => {
            const schema = user.extend(timestamps);

            expect(schema.toJSON()).to.deep.equal({
                title: 'User',
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                },
                required: ['id', 'createdAt'],
                additionalProperties: false,
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                id: number;
                name?: string;
                createdAt: string;
                updatedAt?: string;
            }>();

            // `additionalProperties: false` covers the added properties
            const validator = compile(schema.toJSON());
            expect(validator({ id: 1, createdAt: 'now' })).to.equal(true);
            expect(validator({ id: 1, createdAt: 'now', other: true })).to.equal(false);
        });

        test('Replaces keywords that the argument sets', () => {
            const open = objectSchema({
                properties: { tag: stringSchema() },
                additionalProperties: numberSchema(),
                minProperties: 2,
                unevaluatedProperties: true,
            });
            const schema = user.maxProperties(5).extend(open);

            expect(schema.toJSON()).to.deep.equal({
                title: 'User',
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    tag: { type: 'string' },
                },
                required: ['id'],
                additionalProperties: { type: 'number' },
                minProperties: 2,
                maxProperties: 5,
                unevaluatedProperties: true,
            });
            expect(
                user.minProperties(1).extend(objectSchema().maxProperties(8)).toJSON()
            ).to.include({ minProperties: 1, maxProperties: 8 });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                Flatten<
                    Record<string, number> & {
                        id: number;
                        name?: string;
                        tag?: string;
                    }
                >
            >();
        });

        test('Keeps constraints of both', () => {
            const vendor = stringSchema();
            const left = user
                .patternProperties('^x-' as PatternProperties<`x-${string}`>, vendor)
                .patternProperties('^y-' as PatternProperties<`y-${string}`>, numberSchema())
                .dependentRequired('name', ['id']);
            const right = timestamps
                .patternProperties('^x-' as PatternProperties<`x-${string}`>, vendor)
                .patternProperties(
                    '^y-' as PatternProperties<`y-${string}`>,
                    numberSchema({ type: 'integer' })
                )
                .dependentSchemas('updatedAt', objectSchema({ required: [] }).minProperties(2))
                .allOf(objectSchema().maxProperties(10));
            const schema = left.extend(right);

            expect(schema.toJSON()).to.deep.equal({
                title: 'User',
                type: 'object',
                properties: {
                    id: { type: 'number' },
                    name: { type: 'string' },
                    createdAt: { type: 'string' },
                    updatedAt: { type: 'string' },
                },
                required: ['id', 'createdAt'],
                additionalProperties: false,
                patternProperties: {
                    '^x-': { type: 'string' },
                    '^y-': { type: 'number' },
                },
                dependentRequired: { name: ['id'] },
                dependentSchemas: { updatedAt: { minProperties: 2 } },
                allOf: [
                    { maxProperties: 10 },
                    { patternProperties: { '^y-': { type: 'integer' } } },
                ],
            });
            expectTypeOf<SchemaType<typeof schema>>().toExtend<
                Record<`x-${string}`, string> & Record<`y-${string}`, number>
            >();

            const validator = compile(schema.toJSON());
            expect(validator({ id: 1, createdAt: 'now', 'x-a': 'a', 'y-a': 1 })).to.equal(true);
            expect(validator({ id: 1, createdAt: 'now', 'y-a': 1.5 })).to.equal(false);
            expect(validator({ id: 1, createdAt: 'now', updatedAt: 'now' })).to.equal(true);
            expect(validator({ createdAt: 'now', updatedAt: 'now' })).to.equal(false);
        });

        test('Keeps nullable and annotations of this schema', () => {
            const schema = user.nullable().extend(timestamps.title('Timestamps').nullable());

            expect(schema.toJSON()).to.include({ title: 'User' });
            expect(schema.toJSON()).to.have.property('type').that.deep.equals(['object', 'null']);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<{
                id: number;
                name?: string;
                createdAt: string;
                updatedAt?: string;
            } | null>();

            expect(timestamps.extend(user.nullable()).toJSON()).to.have.property('type', 'object');
        });

        test('Does not change either schema', () => {
            user.extend(timestamps);
            expect(Object.keys(user.toJSON().properties!)).to.deep.equal(['id', 'name']);
            expect(Object.keys(timestamps.toJSON().properties!)).to.deep.equal([
                'createdAt',
                'updatedAt',
            ]);
        });

        test('Rejects duplicate properties', () => {
            // @ts-expect-error
            user.extend(objectSchema({ properties: { id: stringSchema() } }));
        });
    });

    suite('discriminated oneOf', () => {
        const cat = objectSchema({
            properties: {
                kind: enumSchema({ enum: ['cat'] as const }),
                meows: numberSchema(),
            },
            required: ['kind'],
        });
        const dog = objectSchema({
            properties: {
                kind: enumSchema({ enum: ['dog'] as const }),
                barks: numberSchema(),
            },
            required: ['kind', 'barks'],
        });
        const discriminated = { discriminator: true, strict: true } as const;

        test('types and output', () => {
            const schema = objectSchema().oneOf([cat, dog], { discriminator: 'kind' });

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                { kind: 'cat'; meows?: number } | { kind: 'dog'; barks: number }
            >();

            const json = {
                type: 'object',
                oneOf: [
                    {
                        properties: { kind: { const: 'cat' }, meows: { type: 'number' } },
                        required: ['kind'],
                    },
                    {
                        properties: { kind: { const: 'dog' }, barks: { type: 'number' } },
                        required: ['kind', 'barks'],
                    },
                ],
                discriminator: { propertyName: 'kind' },
            };
            expect(schema.toJSON()).to.deep.equal(json);
            // OpenAPI 3.0 has no `const`
            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                ...json,
                oneOf: [
                    {
                        properties: { kind: { enum: ['cat'] }, meows: { type: 'number' } },
                        required: ['kind'],
                    },
                    {
                        properties: { kind: { enum: ['dog'] }, barks: { type: 'number' } },
                        required: ['kind', 'barks'],
                    },
                ],
            });

            const validator = compile(schema.toJSON(), discriminated);
            expect(validator({ kind: 'cat', meows: 1 })).to.equal(true);
            expect(validator({ kind: 'dog', barks: 2 })).to.equal(true);
            expect(validator({ kind: 'dog' })).to.equal(false);
            expect(validator({ kind: 'fish' })).to.equal(false);
            expect(validator({})).to.equal(false);
        });

        test('Strict Ajv rejects the keyword without its discriminator option', () => {
            const schema = objectSchema().oneOf([cat, dog], { discriminator: 'kind' });

            expect(() => compile(schema.toJSON())).to.throw('discriminator');
        });

        test('Referenced branches', () => {
            const schema = objectSchema().oneOf([cat.define('Cat'), dog.define('Dog')], {
                discriminator: 'kind',
            });

            expect(schema.toJSON()).to.deep.include({
                oneOf: [{ $ref: '#/$defs/Cat' }, { $ref: '#/$defs/Dog' }],
                discriminator: { propertyName: 'kind' },
            });

            const validator = compile(schema.toJSON(), discriminated);
            expect(validator({ kind: 'cat' })).to.equal(true);
            expect(validator({ kind: 'dog' })).to.equal(false);
        });

        test('A second oneOf goes in allOf', () => {
            const schema = objectSchema()
                .oneOf([objectSchema({ properties: { a: numberSchema() }, required: ['a'] })])
                .oneOf([cat, dog], { discriminator: 'kind' });

            expect(schema.toJSON()).to.deep.include({
                allOf: [
                    {
                        oneOf: [
                            {
                                properties: { kind: { const: 'cat' }, meows: { type: 'number' } },
                                required: ['kind'],
                            },
                            {
                                properties: { kind: { const: 'dog' }, barks: { type: 'number' } },
                                required: ['kind', 'barks'],
                            },
                        ],
                        discriminator: { propertyName: 'kind' },
                    },
                ],
            });
            expect(compile(schema.toJSON(), discriminated)({ a: 1, kind: 'cat' })).to.equal(true);
        });

        test('Branches that can not be told apart', () => {
            objectSchema().oneOf(
                // @ts-expect-error -- not required
                [
                    cat,
                    objectSchema({ properties: { kind: enumSchema({ enum: ['dog'] as const }) } }),
                ],
                { discriminator: 'kind' }
            );
            objectSchema().oneOf(
                // @ts-expect-error -- any string
                [cat, objectSchema({ properties: { kind: stringSchema() }, required: ['kind'] })],
                { discriminator: 'kind' }
            );
            objectSchema().oneOf(
                // @ts-expect-error -- union
                [
                    cat,
                    objectSchema({
                        properties: { kind: enumSchema({ enum: ['dog', 'wolf'] as const }) },
                        required: ['kind'],
                    }),
                ],
                { discriminator: 'kind' }
            );
            // @ts-expect-error -- duplicate value
            objectSchema().oneOf([cat, cat], { discriminator: 'kind' });
            objectSchema().oneOf(
                // @ts-expect-error -- not a string
                [
                    cat,
                    objectSchema({
                        properties: { kind: enumSchema({ enum: [1] as const }) },
                        required: ['kind'],
                    }),
                ],
                { discriminator: 'kind' }
            );
            // @ts-expect-error -- nullable branch
            objectSchema().oneOf([cat, dog.nullable()], { discriminator: 'kind' });
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

            objectSchema()
                .properties({
                    foo: numberSchema(),
                    bar: numberSchema(),
                })
                // @ts-expect-error
                .properties({
                    foo: numberSchema(),
                    foo2: numberSchema(),
                });
        });
    });
});

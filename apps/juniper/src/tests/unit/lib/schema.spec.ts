import AjvDefault from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { defaultImport } from 'default-import';
import { type JsonSchema, NumberSchema, numberSchema, type Schema, type SchemaType } from 'juniper';
import { suite, test } from 'mocha-chain';

const Ajv = defaultImport(AjvDefault);

// Schema itself is an abstract class, so use NumberSchema
suite('schema', () => {
    suite('create', () => {
        test('constructor', () => {
            const schema = new NumberSchema();
            expectTypeOf(schema).toMatchTypeOf<Schema<number>>();
            expect(schema).to.be.an.instanceOf(NumberSchema);
        });

        test('create', () => {
            const schema = NumberSchema.create();
            expectTypeOf(schema).toMatchTypeOf<Schema<number>>();
            expect(schema).to.be.an.instanceOf(NumberSchema);
        });

        test('method', () => {
            const schema = numberSchema();
            expectTypeOf(schema).toMatchTypeOf<Schema<number>>();
            expect(schema).to.be.an.instanceOf(NumberSchema);
        });
    });

    suite('keywords', () => {
        suite('options', () => {
            suite('success', () => {
                const json = numberSchema({
                    title: '<title>',
                    description: '<description>',
                    deprecated: true,
                    readOnly: true,
                    writeOnly: true,
                }).toJSON();

                expect(json).to.deep.equal({
                    type: 'number',
                    title: '<title>',
                    description: '<description>',
                    deprecated: true,
                    readOnly: true,
                    writeOnly: true,
                });
                const validator = new Ajv({ strict: true }).compile(json);
                expectTypeOf<SchemaType<typeof json>>().toEqualTypeOf<number>();
                expect(validator(123)).to.equal(true);
            });

            test('Unset options', () => {
                const json = numberSchema({
                    title: '<title>',
                    description: '<description>',
                    deprecated: true,
                    readOnly: true,
                    writeOnly: true,
                })
                    .title(null)
                    .description(null)
                    .deprecated(false)
                    .readOnly(false)
                    .writeOnly(false)
                    .toJSON();

                expect(json).to.deep.equal({
                    type: 'number',
                });
            });
        });

        test('methods', () => {
            const schema = numberSchema()
                .title('<title>')
                .description('<description>')
                .deprecated(true)
                .readOnly(true)
                .writeOnly(true)
                .example(1)
                .example(2)
                .metadata('xCustomVal', 123)
                .metadata({
                    customKeyword: 'foobar',
                })
                .toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
                title: '<title>',
                description: '<description>',
                deprecated: true,
                readOnly: true,
                writeOnly: true,
                examples: [1, 2],
                xCustomVal: 123,
                customKeyword: 'foobar',
            });
        });

        test('immutable', () => {
            const schema = numberSchema().title('<title>');
            const updatedSchema = schema.description('<description>');

            expect(schema).to.not.equal(updatedSchema);
        });
    });

    suite('toJSON', () => {
        test('With schema', () => {
            const schema = numberSchema().toJSON({
                schema: true,
            });

            expect(schema).to.deep.equal({
                $schema: 'https://json-schema.org/draft/2020-12/schema',
                type: 'number',
            });
        });

        test('id', () => {
            const schema = numberSchema().toJSON({
                id: '<id>',
            });

            expect(schema).to.deep.equal({
                $id: '<id>',
                type: 'number',
            });
        });

        test('openApi30', () => {
            const schema = numberSchema().example(1).example(2).toJSON({
                id: '<id>',
                openApi30: true,
            });

            expect(schema).to.deep.equal({
                type: 'number',
                example: 1,
            });
        });

        test('type', () => {
            const sym = Symbol('sym');
            type CustomNumber = number & {
                [sym]?: typeof sym;
            };

            const schema = numberSchema().cast<CustomNumber>();
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<CustomNumber>();
            const json = schema.toJSON();
            expectTypeOf<SchemaType<typeof json>>().toEqualTypeOf<CustomNumber>();
        });

        suite('With subschemas', () => {
            suite('Base is not nullable', () => {
                test('If + Else are nullable', () => {
                    const schema = numberSchema<-1 | 4 | 7 | 12>()
                        .if(numberSchema<-1 | 4>().nullable().maximum(5), {
                            else: numberSchema<12>().minimum(10).nullable(),
                        })
                        .not(numberSchema().minimum(15));

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<-1 | 4 | 12>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'number',
                        if: {
                            maximum: 5,
                        },
                        else: {
                            minimum: 10,
                        },
                        not: {
                            minimum: 15,
                        },
                    });
                    const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                    expect(validator(4.5)).to.equal(true);
                    expect(validator(12)).to.equal(true);
                    expect(validator(null)).to.equal(false);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        anyOf: [
                            {
                                maximum: 5,
                            },
                            {
                                minimum: 10,
                            },
                        ],
                        not: {
                            minimum: 15,
                        },
                    });
                    const oaValidator = new Ajv({ strict: true }).compile(
                        schema.toJSON({ openApi30: true })
                    );
                    expect(oaValidator(4.5)).to.equal(true);
                    expect(oaValidator(12)).to.equal(true);
                    expect(oaValidator(null)).to.equal(false);

                    expectTypeOf(schema.nullable().toJSON()).toEqualTypeOf<
                        JsonSchema<-1 | 4 | 12 | null>
                    >();
                    expectTypeOf(
                        schema.not(numberSchema().nullable()).nullable().toJSON()
                    ).toEqualTypeOf<JsonSchema<-1 | 4 | 12>>();
                });

                test('If + Then + Else are nullable', () => {
                    const schema = numberSchema<-1 | 4 | 7 | 12>().if(
                        numberSchema<-1 | 4>().nullable().maximum(5),
                        {
                            // eslint-disable-next-line unicorn/no-thenable
                            then: numberSchema({ type: 'integer' }).nullable(),
                            else: numberSchema<12>().minimum(10).nullable(),
                        }
                    );

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<-1 | 4 | 12>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'number',
                        allOf: [
                            {
                                if: {
                                    maximum: 5,
                                },
                                // eslint-disable-next-line unicorn/no-thenable
                                then: {
                                    type: 'integer',
                                },
                                else: {
                                    minimum: 10,
                                },
                            },
                        ],
                    });
                    const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                    expect(validator(4)).to.equal(true);
                    expect(validator(4.5)).to.equal(false);
                    expect(validator(7)).to.equal(false);
                    expect(validator(12)).to.equal(true);
                    expect(validator(null)).to.equal(false);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        anyOf: [
                            {
                                not: {
                                    maximum: 5,
                                },
                            },
                            {
                                type: 'integer',
                            },
                        ],
                        allOf: [
                            {
                                anyOf: [
                                    {
                                        maximum: 5,
                                    },
                                    {
                                        minimum: 10,
                                    },
                                ],
                            },
                        ],
                    });
                    const oaValidator = new Ajv({ strict: true }).compile(
                        schema.toJSON({ openApi30: true })
                    );
                    expect(oaValidator(4)).to.equal(true);
                    expect(oaValidator(4.5)).to.equal(false);
                    expect(oaValidator(7)).to.equal(false);
                    expect(oaValidator(12)).to.equal(true);
                    expect(oaValidator(null)).to.equal(false);

                    expectTypeOf(schema.nullable().toJSON()).toEqualTypeOf<
                        JsonSchema<-1 | 4 | 12 | null>
                    >();

                    expect(schema.nullable().toJSON()).to.deep.equal({
                        type: ['number', 'null'],
                        allOf: [
                            {
                                if: {
                                    maximum: 5,
                                },
                                // eslint-disable-next-line unicorn/no-thenable
                                then: {
                                    type: ['integer', 'null'],
                                },
                                else: {
                                    minimum: 10,
                                },
                            },
                        ],
                    });
                    expect(schema.nullable().toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        nullable: true,
                        anyOf: [
                            {
                                not: {
                                    maximum: 5,
                                },
                            },
                            {
                                type: 'integer',
                                nullable: true,
                            },
                        ],
                        allOf: [
                            {
                                anyOf: [
                                    {
                                        maximum: 5,
                                    },
                                    {
                                        minimum: 10,
                                    },
                                ],
                            },
                        ],
                    });
                });

                test('Not is nullable', () => {
                    const schema = numberSchema().not(numberSchema({ type: 'integer' }).nullable());

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'number',
                        not: {
                            type: 'integer',
                        },
                    });
                    const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                    expect(validator(4.5)).to.equal(true);
                    expect(validator(12)).to.equal(false);
                    expect(validator(null)).to.equal(false);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        not: {
                            type: 'integer',
                        },
                    });
                    const oaValidator = new Ajv({ strict: true }).compile(
                        schema.toJSON({ openApi30: true })
                    );
                    expect(oaValidator(4.5)).to.equal(true);
                    expect(oaValidator(12)).to.equal(false);
                    expect(oaValidator(null)).to.equal(false);
                });
            });

            suite('Base is nullable', () => {
                suite('Subschemas are partially nullable', () => {
                    test('If is nullable', () => {
                        const schema = numberSchema<-1 | 4 | 7 | 12>()
                            .nullable()
                            .if(numberSchema<-1 | 4>().nullable().maximum(5), {
                                else: numberSchema<12>().minimum(10),
                            });

                        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                            -1 | 4 | 12 | null
                        >();

                        expect(schema.toJSON()).to.deep.equal({
                            type: ['number', 'null'],
                            if: {
                                maximum: 5,
                            },
                            else: {
                                type: 'number',
                                minimum: 10,
                            },
                        });
                        const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                        expect(validator(4.5)).to.equal(true);
                        expect(validator(7)).to.equal(false);
                        expect(validator(12)).to.equal(true);
                        expect(validator(null)).to.equal(true);

                        expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                            type: 'number',
                            nullable: true,
                            anyOf: [
                                {
                                    maximum: 5,
                                },
                                {
                                    type: 'number',
                                    minimum: 10,
                                },
                            ],
                        });
                        const oaValidator = new Ajv({ strict: true }).compile(
                            schema.toJSON({ openApi30: true })
                        );
                        expect(oaValidator(4.5)).to.equal(true);
                        expect(oaValidator(7)).to.equal(false);
                        expect(oaValidator(12)).to.equal(true);
                        expect(oaValidator(null)).to.equal(true);
                    });

                    test('Then is nullable', () => {
                        const schema = numberSchema<-1 | 4 | 7 | 12>()
                            .nullable()
                            .if(numberSchema<-1 | 4>().maximum(5), {
                                // eslint-disable-next-line unicorn/no-thenable
                                then: numberSchema<4>({
                                    type: 'integer',
                                }).nullable(),
                            });

                        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                            -1 | 4 | 7 | 12 | null
                        >();

                        expect(schema.toJSON()).to.deep.equal({
                            type: ['number', 'null'],
                            allOf: [
                                {
                                    if: {
                                        type: 'number',
                                        maximum: 5,
                                    },
                                    // eslint-disable-next-line unicorn/no-thenable
                                    then: {
                                        type: ['integer', 'null'],
                                    },
                                },
                            ],
                        });
                        const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                        expect(validator(4)).to.equal(true);
                        expect(validator(4.5)).to.equal(false);
                        expect(validator(7)).to.equal(true);
                        expect(validator(null)).to.equal(true);

                        expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                            type: 'number',
                            nullable: true,
                            anyOf: [
                                {
                                    not: {
                                        type: 'number',
                                        maximum: 5,
                                    },
                                },
                                {
                                    type: 'integer',
                                    nullable: true,
                                },
                            ],
                        });
                        const oaValidator = new Ajv({ strict: true }).compile(
                            schema.toJSON({ openApi30: true })
                        );
                        expect(oaValidator(4)).to.equal(true);
                        expect(oaValidator(4.5)).to.equal(false);
                        expect(oaValidator(7)).to.equal(true);
                        expect(oaValidator(null)).to.equal(true);
                    });

                    test('Else is nullable', () => {
                        const schema = numberSchema<-1 | 4 | 7 | 12>()
                            .nullable()
                            .if(numberSchema<-1 | 4>().maximum(5), {
                                // eslint-disable-next-line unicorn/no-thenable
                                then: numberSchema({ type: 'integer' }),
                                else: numberSchema<12>().nullable().minimum(10),
                            });

                        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<
                            -1 | 4 | 12 | null
                        >();

                        expect(schema.toJSON()).to.deep.equal({
                            type: ['number', 'null'],
                            allOf: [
                                {
                                    if: {
                                        type: 'number',
                                        maximum: 5,
                                    },
                                    // eslint-disable-next-line unicorn/no-thenable
                                    then: {
                                        type: 'integer',
                                    },
                                    else: {
                                        minimum: 10,
                                    },
                                },
                            ],
                        });
                        const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                        expect(validator(4)).to.equal(true);
                        expect(validator(4.5)).to.equal(false);
                        expect(validator(12)).to.equal(true);
                        expect(validator(null)).to.equal(true);

                        expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                            type: 'number',
                            nullable: true,
                            anyOf: [
                                {
                                    not: {
                                        type: 'number',
                                        maximum: 5,
                                    },
                                },
                                {
                                    type: 'integer',
                                },
                            ],
                            allOf: [
                                {
                                    anyOf: [
                                        {
                                            type: 'number',
                                            maximum: 5,
                                        },
                                        {
                                            minimum: 10,
                                        },
                                    ],
                                },
                            ],
                        });
                        const oaValidator = new Ajv({ strict: true }).compile(
                            schema.toJSON({ openApi30: true })
                        );
                        expect(oaValidator(4)).to.equal(true);
                        expect(oaValidator(4.5)).to.equal(false);
                        expect(oaValidator(12)).to.equal(true);
                        expect(oaValidator(null)).to.equal(true);
                    });
                });

                test('Subschemas are partially nullable and stricter', () => {
                    const schema = numberSchema<-1 | 4 | 7 | 12>().if(
                        numberSchema<-1 | 4>({
                            maximum: 5,
                            type: 'integer',
                        }).nullable(),
                        {
                            else: numberSchema<12>().minimum(10),
                        }
                    );

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<-1 | 4 | 12>();
                    expect(schema.toJSON()).to.deep.equal({
                        type: 'number',
                        if: {
                            type: 'integer',
                            maximum: 5,
                        },
                        else: {
                            minimum: 10,
                        },
                    });
                    const validator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(schema.toJSON());
                    expect(validator(4)).to.equal(true);
                    expect(validator(3.5)).to.equal(false);
                    expect(validator(12.5)).to.equal(true);
                    expect(validator(null)).to.equal(false);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        anyOf: [
                            {
                                type: 'integer',
                                maximum: 5,
                            },
                            {
                                minimum: 10,
                            },
                        ],
                    });
                    const oaValidator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(schema.toJSON({ openApi30: true }));
                    expect(oaValidator(4)).to.equal(true);
                    expect(oaValidator(3.5)).to.equal(false);
                    expect(oaValidator(12.5)).to.equal(true);
                    expect(oaValidator(null)).to.equal(false);

                    const nullable = schema.nullable();
                    expectTypeOf<SchemaType<typeof nullable>>().toEqualTypeOf<-1 | 4 | 12 | null>();

                    expect(nullable.toJSON()).to.deep.equal({
                        type: ['number', 'null'],
                        if: {
                            type: ['integer', 'null'],
                            maximum: 5,
                        },
                        else: {
                            type: 'number',
                            minimum: 10,
                        },
                    });
                    const nullableValidator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(nullable.toJSON());
                    expect(nullableValidator(4)).to.equal(true);
                    expect(nullableValidator(3.5)).to.equal(false);
                    expect(nullableValidator(12.5)).to.equal(true);
                    expect(nullableValidator(null)).to.equal(true);

                    expect(nullable.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        nullable: true,
                        anyOf: [
                            {
                                type: 'integer',
                                nullable: true,
                                maximum: 5,
                            },
                            {
                                type: 'number',
                                minimum: 10,
                            },
                        ],
                    });
                    const nullableOaValidator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(nullable.toJSON({ openApi30: true }));
                    expect(nullableOaValidator(4)).to.equal(true);
                    expect(nullableOaValidator(3.5)).to.equal(false);
                    expect(nullableOaValidator(12.5)).to.equal(true);
                    expect(nullableOaValidator(null)).to.equal(true);
                });

                test('Subschemas are not nullable', () => {
                    const schema = numberSchema<-1 | 4 | 7 | 12>({
                        type: 'integer',
                    }).if(numberSchema<-1 | 4>({ type: 'integer' }).maximum(5), {
                        else: numberSchema<12>({ type: 'integer' }).minimum(10),
                    });

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<-1 | 4 | 12>();

                    const stillNotNullable = schema.nullable();
                    expectTypeOf<SchemaType<typeof stillNotNullable>>().toEqualTypeOf<
                        -1 | 4 | 12
                    >();

                    expect(schema.toJSON()).to.deep.equal(stillNotNullable.toJSON());
                    expect(schema.toJSON({ openApi30: true })).to.deep.equal(
                        stillNotNullable.toJSON({ openApi30: true })
                    );
                    expect(schema.toJSON()).to.deep.equal({
                        type: 'integer',
                        if: {
                            maximum: 5,
                        },
                        else: {
                            minimum: 10,
                        },
                    });

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'integer',
                        anyOf: [
                            {
                                maximum: 5,
                            },
                            {
                                minimum: 10,
                            },
                        ],
                    });
                });

                test('Subschemas are deeply not nullable', () => {
                    const schema = numberSchema<-1 | 4 | 7 | 12>({
                        type: 'number',
                    })
                        .nullable()
                        .if(
                            numberSchema<-1 | 4>({ type: 'number' })
                                .nullable()
                                .maximum(5)
                                .if(
                                    numberSchema({
                                        type: 'integer',
                                    }).nullable(),
                                    {
                                        // eslint-disable-next-line unicorn/no-thenable
                                        then: numberSchema({ multipleOf: 2 }),
                                    }
                                ),
                            {
                                else: numberSchema<12>({
                                    type: 'integer',
                                }).minimum(10),
                            }
                        );

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<-1 | 4 | 12>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'number',
                        if: {
                            maximum: 5,
                            allOf: [
                                {
                                    if: {
                                        type: 'integer',
                                    },
                                    // eslint-disable-next-line unicorn/no-thenable
                                    then: {
                                        multipleOf: 2,
                                    },
                                },
                            ],
                        },
                        else: {
                            type: 'integer',
                            minimum: 10,
                        },
                    });
                    const validator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(schema.toJSON());
                    expect(validator(4)).to.equal(true);
                    expect(validator(3)).to.equal(false);
                    expect(validator(3.5)).to.equal(true);
                    expect(validator(11)).to.equal(true);
                    expect(validator(11.5)).to.equal(false);
                    expect(validator(null)).to.equal(false);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        anyOf: [
                            {
                                maximum: 5,
                                anyOf: [
                                    {
                                        not: {
                                            type: 'integer',
                                        },
                                    },
                                    {
                                        multipleOf: 2,
                                    },
                                ],
                            },
                            {
                                type: 'integer',
                                minimum: 10,
                            },
                        ],
                    });
                    const oaValidator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(schema.toJSON({ openApi30: true }));
                    expect(oaValidator(4)).to.equal(true);
                    expect(oaValidator(3)).to.equal(false);
                    expect(oaValidator(3.5)).to.equal(true);
                    expect(oaValidator(11)).to.equal(true);
                    expect(oaValidator(11.5)).to.equal(false);
                    expect(oaValidator(null)).to.equal(false);
                });

                test('Not is nullable', () => {
                    const schema = numberSchema()
                        .nullable()
                        .not(numberSchema({ type: 'integer' }).nullable());

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'number',
                        not: {
                            type: 'integer',
                        },
                    });
                    const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                    expect(validator(3.5)).to.equal(true);
                    expect(validator(11)).to.equal(false);
                    expect(validator(null)).to.equal(false);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        not: {
                            type: 'integer',
                        },
                    });

                    const stillNotNullable = numberSchema()
                        .not(numberSchema({ type: 'integer' }).nullable())
                        .not(numberSchema({ type: 'integer' }))
                        .nullable();

                    expect(stillNotNullable.toJSON()).to.deep.equal({
                        type: 'number',
                        not: {
                            type: 'integer',
                        },
                        allOf: [
                            {
                                not: {
                                    type: 'integer',
                                },
                            },
                        ],
                    });
                    expectTypeOf<SchemaType<typeof stillNotNullable>>().toEqualTypeOf<number>();

                    const stillNotNullableValidator = new Ajv({
                        strict: true,
                    }).compile(schema.toJSON());
                    expect(stillNotNullableValidator(3.5)).to.equal(true);
                    expect(stillNotNullableValidator(11)).to.equal(false);
                    expect(stillNotNullableValidator(null)).to.equal(false);
                });

                test('Not is not nullable', () => {
                    const schema = numberSchema()
                        .nullable()
                        .not(numberSchema({ type: 'integer' }));

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number | null>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: ['number', 'null'],
                        not: {
                            type: 'integer',
                        },
                    });
                    const validator = new Ajv({ strict: true }).compile(schema.toJSON());
                    expect(validator(3.5)).to.equal(true);
                    expect(validator(11)).to.equal(false);
                    expect(validator(null)).to.equal(true);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        nullable: true,
                        not: {
                            type: 'integer',
                        },
                    });
                    const oaValidator = new Ajv({ strict: true }).compile(
                        schema.toJSON({ openApi30: true })
                    );
                    expect(oaValidator(3.5)).to.equal(true);
                    expect(oaValidator(11)).to.equal(false);
                    expect(oaValidator(null)).to.equal(true);
                });

                test('Not is deeply not nullable', () => {
                    const schema = numberSchema()
                        .nullable()
                        .not(
                            numberSchema({ type: 'integer' })
                                .nullable()
                                .not(numberSchema().nullable().minimum(5))
                        );

                    expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number | null>();

                    expect(schema.toJSON()).to.deep.equal({
                        type: ['number', 'null'],
                        not: {
                            type: 'integer',
                            not: {
                                minimum: 5,
                            },
                        },
                    });
                    const validator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(schema.toJSON());
                    expect(validator(3.5)).to.equal(true);
                    expect(validator(4)).to.equal(false);
                    expect(validator(11)).to.equal(true);
                    expect(validator(null)).to.equal(true);

                    expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                        type: 'number',
                        nullable: true,
                        not: {
                            type: 'integer',
                            not: {
                                minimum: 5,
                            },
                        },
                    });
                    const oaValidator = new Ajv({
                        strict: true,
                        strictTypes: false,
                    }).compile(schema.toJSON({ openApi30: true }));
                    expect(oaValidator(3.5)).to.equal(true);
                    expect(oaValidator(4)).to.equal(false);
                    expect(oaValidator(11)).to.equal(true);
                    expect(oaValidator(null)).to.equal(true);
                });
            });

            suite('Base is number', () => {
                test('If + Else are integer', () => {
                    const schema = numberSchema().if(numberSchema({ type: 'integer' }), {
                        else: numberSchema({ type: 'integer' }),
                    });

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'integer',
                        if: {},
                        else: {},
                    });
                });

                test('Then + Else are integer', () => {
                    const schema = numberSchema().if(numberSchema().maximum(5), {
                        // eslint-disable-next-line unicorn/no-thenable
                        then: numberSchema({ type: 'integer' }),
                        else: numberSchema({ type: 'integer' }),
                    });

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'integer',
                        allOf: [
                            {
                                if: { maximum: 5 },
                                // eslint-disable-next-line unicorn/no-thenable
                                then: {},
                                else: {},
                            },
                        ],
                    });
                });

                test('Base is integer', () => {
                    const schema = numberSchema()
                        .type('integer')
                        .if(numberSchema().maximum(5), {
                            // eslint-disable-next-line unicorn/no-thenable
                            then: numberSchema().minimum(0),
                            else: numberSchema().minimum(10),
                        });

                    expect(schema.toJSON()).to.deep.equal({
                        type: 'integer',
                        allOf: [
                            {
                                if: { maximum: 5 },
                                // eslint-disable-next-line unicorn/no-thenable
                                then: { minimum: 0 },
                                else: { minimum: 10 },
                            },
                        ],
                    });
                });
            });
        });
    });

    suite('if', () => {
        test('Multiple conditions', () => {
            const schema = numberSchema()
                .if(numberSchema().maximum(5), {
                    // eslint-disable-next-line unicorn/no-thenable
                    then: numberSchema().minimum(0),
                    else: numberSchema().minimum(10),
                })
                .if(numberSchema({ type: 'integer' }), {
                    else: numberSchema().multipleOf(4.4),
                });

            expect(schema.toJSON()).to.deep.equal({
                type: 'number',
                allOf: [
                    {
                        if: { maximum: 5 },
                        // eslint-disable-next-line unicorn/no-thenable
                        then: { minimum: 0 },
                        else: { minimum: 10 },
                    },
                    {
                        if: { type: 'integer' },
                        else: { multipleOf: 4.4 },
                    },
                ],
            });
            expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                type: 'number',
                anyOf: [{ not: { maximum: 5 } }, { minimum: 0 }],
                allOf: [
                    {
                        anyOf: [{ maximum: 5 }, { minimum: 10 }],
                    },
                    {
                        anyOf: [{ type: 'integer' }, { multipleOf: 4.4 }],
                    },
                ],
            });
        });
    });

    suite('not', () => {
        test('success', () => {
            const schema = numberSchema()
                .not(numberSchema({ minimum: 1 }).not(numberSchema({ maximum: 12 })))
                .not(numberSchema({ maximum: 10 }))
                .toJSON();

            expect(schema).to.deep.equal({
                type: 'number',
                allOf: [
                    {
                        not: {
                            maximum: 10,
                        },
                    },
                ],
                not: {
                    minimum: 1,
                    not: {
                        maximum: 12,
                    },
                },
            });
            const validator = new Ajv({ strict: true }).compile(schema);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number>();
            expect(validator(11)).to.equal(true);
            expect(validator(13)).to.equal(false);
            expect(validator(9)).to.equal(false);
        });
    });

    suite('nullable', () => {
        test('success', () => {
            const schema = numberSchema().nullable().toJSON();

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number | null>();
            expect(schema).to.deep.equal({
                type: ['number', 'null'],
            });
        });
    });

    suite('ref', () => {
        test('success', () => {
            const schema = numberSchema().ref('/path/to/ref').toJSON();

            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number>();
            expect(schema).to.deep.equal({
                $ref: '/path/to/ref',
            });
        });

        suite('Handles inconsistencies', () => {
            test('Applies default values', () => {
                const schema = numberSchema()
                    .type('integer')
                    .nullable()
                    .exclusiveMinimum(3)
                    .ref('/path/to/ref')
                    .maximum(10)
                    .minimum(Number.NEGATIVE_INFINITY)
                    .type('number');

                expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<number | null>();
                expect(schema.toJSON()).to.deep.equal({
                    $ref: '/path/to/ref',
                    type: ['number', 'null'],
                    exclusiveMinimum: -1.797_693_134_862_315_7e308,
                    maximum: 10,
                });

                expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                    $ref: '/path/to/ref',
                    type: 'number',
                    maximum: 10,
                    exclusiveMinimum: false,
                    minimum: -1.797_693_134_862_315_7e308,
                });

                expect(
                    numberSchema()
                        .readOnly(true)
                        .writeOnly(true)
                        .ref('/first/path')
                        .writeOnly(false)
                        .ref('/second/path')
                        .readOnly(false)
                        .toJSON()
                ).to.deep.equal({
                    $ref: '/second/path',
                    readOnly: false,
                });
            });

            test('Does not optimize integer', () => {
                expect(
                    numberSchema()
                        .multipleOf(3.5)
                        .multipleOf(1.2)
                        .anyOf([
                            numberSchema({ type: 'number' }).minimum(0),
                            numberSchema({ type: 'integer' }),
                        ])
                        .ref('/path/to/base')
                        .if(
                            numberSchema({
                                type: 'integer',
                                multipleOf: 5,
                            }).nullable(),
                            {
                                else: numberSchema({ multipleOf: 6 })
                                    .ref('/path/to/else')
                                    .type('integer'),
                            }
                        )
                        .toJSON()
                ).to.deep.equal({
                    $ref: '/path/to/base',
                    if: {
                        multipleOf: 5,
                        type: 'integer',
                    },
                    else: {
                        $ref: '/path/to/else',
                        type: 'integer',
                    },
                });
            });

            test('Overrides type', () => {
                const schema = numberSchema().ref('/path/to/base').nullable().type('integer');

                expect(schema.toJSON()).to.deep.equal({
                    $ref: '/path/to/base',
                    type: ['integer', 'null'],
                });

                expect(schema.toJSON({ openApi30: true })).to.deep.equal({
                    $ref: '/path/to/base',
                    type: 'integer',
                    nullable: true,
                });

                expect(
                    numberSchema({ type: 'integer' })
                        .ref('/path/to/base')
                        .nullable()
                        .type('number')
                        .toJSON()
                ).to.deep.equal({
                    $ref: '/path/to/base',
                    type: ['number', 'null'],
                });
            });

            test('Only replaces nullable when necessary', () => {
                const refThenNull = numberSchema().allOf(
                    numberSchema().ref('/path/to/allOf').nullable()
                );

                expect(refThenNull.toJSON()).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                        },
                    ],
                });

                expect(refThenNull.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                        },
                    ],
                });

                const nullableRefThenNull = refThenNull.nullable();

                expect(nullableRefThenNull.toJSON()).to.deep.equal({
                    type: ['number', 'null'],
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                            type: ['number', 'null'],
                        },
                    ],
                });

                expect(nullableRefThenNull.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'number',
                    nullable: true,
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                            nullable: true,
                        },
                    ],
                });

                const nullThenRef = numberSchema().allOf(
                    numberSchema().nullable().ref('/path/to/allOf')
                );

                expect(nullThenRef.toJSON()).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                        },
                    ],
                });
                expect(nullThenRef.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                        },
                    ],
                });

                const nullableNullThenRef = nullThenRef.nullable();

                expect(nullableNullThenRef.toJSON()).to.deep.equal({
                    type: ['number', 'null'],
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                        },
                    ],
                });
                expect(nullableNullThenRef.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'number',
                    nullable: true,
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                        },
                    ],
                });
            });

            test('Handles integer + number', () => {
                const integerToNumber = numberSchema()
                    .allOf(
                        numberSchema({ type: 'integer' })
                            .ref('/path/to/allOf')
                            .nullable()
                            .type('number')
                    )
                    .nullable();

                expect(integerToNumber.toJSON()).to.deep.equal({
                    type: ['number', 'null'],
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                            type: ['number', 'null'],
                        },
                    ],
                });

                expect(integerToNumber.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'number',
                    nullable: true,
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                            type: 'number',
                            nullable: true,
                        },
                    ],
                });

                const integerToNumberInsideInteger = integerToNumber.type('integer');

                expect(integerToNumberInsideInteger.toJSON()).to.deep.equal({
                    type: ['integer', 'null'],
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                            type: ['integer', 'null'],
                        },
                    ],
                });

                expect(integerToNumberInsideInteger.toJSON({ openApi30: true })).to.deep.equal({
                    type: 'integer',
                    nullable: true,
                    allOf: [
                        {
                            $ref: '/path/to/allOf',
                            nullable: true,
                        },
                    ],
                });
            });

            test('Integer to number', () => {
                const integerToNumber = numberSchema({ type: 'integer' })
                    .nullable()
                    .ref('/path/to/base')
                    .type('number');

                expect(integerToNumber.toJSON()).to.deep.equal({
                    $ref: '/path/to/base',
                    type: ['number', 'null'],
                });

                expect(integerToNumber.toJSON({ openApi30: true })).to.deep.equal({
                    $ref: '/path/to/base',
                    type: 'number',
                });

                const inComposite = numberSchema()
                    .ref('/path/to/base')
                    .if(numberSchema({ type: 'integer' }).nullable(), {
                        else: numberSchema({ type: 'integer' }).ref('/path/to/else').type('number'),
                    });

                expect(inComposite.toJSON()).to.deep.equal({
                    $ref: '/path/to/base',
                    if: {
                        type: 'integer',
                    },
                    else: {
                        $ref: '/path/to/else',
                        type: 'number',
                    },
                });

                expect(inComposite.toJSON({ openApi30: true })).to.deep.equal({
                    $ref: '/path/to/base',
                    anyOf: [
                        { type: 'integer' },
                        {
                            $ref: '/path/to/else',
                            type: 'number',
                        },
                    ],
                });
            });

            test('Strict schemas', () => {
                const schema = numberSchema().allOf(
                    numberSchema({ type: 'integer' }).ref('/path/to/first').type('number')
                );

                expect(schema.toJSON()).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            $ref: '/path/to/first',
                            type: 'number',
                        },
                    ],
                });

                const stillNumber = numberSchema().allOf(schema.ref('/path/to/second'));

                expect(stillNumber.toJSON()).to.deep.equal({
                    type: 'number',
                    allOf: [
                        {
                            $ref: '/path/to/second',
                        },
                    ],
                });

                const integer = stillNumber.type('integer');

                expect(integer.toJSON()).to.deep.equal({
                    type: 'integer',
                    allOf: [
                        {
                            $ref: '/path/to/second',
                        },
                    ],
                });

                const baseWasNumber = numberSchema()
                    .allOf(
                        numberSchema()
                            .allOf(numberSchema().ref('/path/to/first'))
                            .ref('/path/to/second')
                    )
                    .type('integer');

                expect(baseWasNumber.toJSON()).to.deep.equal({
                    type: 'integer',
                    allOf: [
                        {
                            $ref: '/path/to/second',
                        },
                    ],
                });
            });
        });
    });

    suite('Invalid types', () => {
        test('Reserved metadata keywords', () => {
            const schema = numberSchema();

            expect(() => {
                schema.metadata(
                    // @ts-expect-error
                    'if',
                    {}
                );
            }).to.throw('Illegal use of reserved word: if');

            expect(() => {
                schema.metadata(
                    // @ts-expect-error
                    { properties: 123 }
                );
            }).to.throw('Illegal use of reserved word: properties');
        });
    });
});

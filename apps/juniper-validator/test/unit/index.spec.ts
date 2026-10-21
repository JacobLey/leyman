import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { SchemaType } from 'juniper';
import type { AssertionType, JuniperValidator, ValidatorType } from 'juniper-validator';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    arraySchema,
    enumSchema,
    mergeSchema,
    numberSchema,
    objectSchema,
    stringSchema,
} from 'juniper';
import { makeValidator } from 'juniper-validator';
import { suite, test } from 'mocha-chain';

// Schema itself is an abstract class, so use NumberSchema
suite('juniper-validator', () => {
    const schema = mergeSchema().anyOf([
        numberSchema().exclusiveMinimum(2).maximum(13),
        stringSchema().contains('foo').endsWith('bar'),
    ]);

    const validator = makeValidator(schema);
    const valids = [5, 13, 'food bar', 'abc foo def bar'];
    const invalids = [2, 99, 'bar of food', true, null];

    suite('StandardSchema', () => {
        expectTypeOf(validator).toExtend<StandardSchemaV1<SchemaType<typeof schema>>>();

        suite('validate', () => {
            test('validate', () => {
                expect(validator.validate).to.equal(validator['~standard'].validate);
            });

            test('success', () => {
                for (const valid of valids) {
                    expect(validator.validate(valid)).to.deep.equal({
                        value: valid,
                    });
                    expect(validator['~standard'].validate(valid)).to.deep.equal({
                        value: valid,
                    });
                }
            });

            test('failure', () => {
                for (const invalid of invalids) {
                    const result = validator.validate(invalid);
                    expect(result.issues).to.be.an.instanceOf(Array);
                    expect(result.issues!.length).to.be.greaterThan(0);
                }

                expect(validator.validate([]).issues!.map(issue => issue.message)).to.deep.equal([
                    'must be number',
                    'must be string',
                    'must match a schema in anyOf',
                ]);
            });

            test('Falls back to keyword when Ajv omits messages', () => {
                const quiet = makeValidator(numberSchema(), { messages: false });
                expect(quiet.validate('5').issues!.map(issue => issue.message)).to.deep.equal([
                    'must pass "type" keyword validation',
                ]);
            });
        });

        suite('path', () => {
            const objectValidator = makeValidator(
                objectSchema({
                    properties: {
                        list: arraySchema({
                            items: objectSchema({
                                properties: { 'a/~b': numberSchema() },
                            }),
                        }),
                        name: stringSchema(),
                    },
                    required: ['list', 'name'],
                }),
                { allErrors: true }
            );

            test('Root', () => {
                expect(validator.validate([]).issues!.map(issue => issue.path)).to.deep.equal([
                    [],
                    [],
                    [],
                ]);
            });

            test('Array indices and escaped keys', () => {
                expect(
                    objectValidator.validate({ list: [{}, { 'a/~b': 'x' }], name: 'Ada' }).issues
                ).to.deep.equal([
                    {
                        instancePath: '/list/1/a~1~0b',
                        schemaPath: '#/properties/list/items/properties/a~1~0b/type',
                        keyword: 'type',
                        params: { type: 'number' },
                        message: 'must be number',
                        path: ['list', 1, 'a/~b'],
                    },
                ]);
            });

            test('Missing properties', () => {
                expect(
                    objectValidator.validate({ list: [] }).issues!.map(issue => issue.path)
                ).to.deep.equal([['name']]);

                const dependent = makeValidator<object>({
                    type: 'object',
                    dependentRequired: { a: ['b'] },
                });
                expect(dependent.validate({ a: 1 }).issues!.map(issue => issue.path)).to.deep.equal(
                    [['b']]
                );
            });

            test('Ignores jsPropertySyntax', () => {
                const jsSyntax = makeValidator(
                    numberSchema(),
                    // @ts-expect-error - not a JSON Pointer, so not supported
                    { jsPropertySyntax: true }
                );
                const nested = makeValidator(
                    arraySchema({ items: numberSchema() }),
                    // @ts-expect-error - not a JSON Pointer, so not supported
                    { jsPropertySyntax: true }
                );
                expect(jsSyntax.validate('5').issues!.map(issue => issue.path)).to.deep.equal([[]]);
                expect(nested.validate(['5']).issues!.map(issue => issue.path)).to.deep.equal([
                    [0],
                ]);
            });
        });
    });

    suite('StandardJSONSchema', () => {
        expectTypeOf(validator).toExtend<StandardJSONSchemaV1<SchemaType<typeof schema>>>();

        test('Uses the Juniper schema', () => {
            expect(validator['~standard'].jsonSchema).to.equal(schema['~standard'].jsonSchema);
            expect(
                validator['~standard'].jsonSchema.input({ target: 'draft-2020-12' })
            ).to.deep.equal(schema.toJSON());
        });

        suite('JSON schema', () => {
            const json = { type: 'number' } as const;
            const jsonValidator = makeValidator<number>(json);

            test('draft-2020-12', () => {
                expect(
                    jsonValidator['~standard'].jsonSchema.input({ target: 'draft-2020-12' })
                ).to.equal(json);
                expect(
                    jsonValidator['~standard'].jsonSchema.output({ target: 'draft-2020-12' })
                ).to.equal(json);
            });

            test('Other targets are not supported', () => {
                expect(() =>
                    jsonValidator['~standard'].jsonSchema.input({ target: 'draft-07' })
                ).to.throw(Error, 'JSON Schema target: "draft-07" not supported');
            });
        });
    });

    suite('Metadata', () => {
        test('Juniper metadata is allowed in strict mode', () => {
            const withMetadata = makeValidator(
                objectSchema({
                    properties: {
                        list: arraySchema({ items: stringSchema().metadata('x-item', 1) }),
                        either: mergeSchema().anyOf([numberSchema().metadata('x-option', 2)]),
                    },
                    additionalProperties: false,
                }).metadata({ 'x-root': true })
            );
            expect(withMetadata.is({ list: ['a'], either: 1 })).to.equal(true);
            expect(withMetadata.is({ list: [1] })).to.equal(false);
            expect(withMetadata.is({ extra: 1 })).to.equal(false);
        });

        test('Unknown keywords in JSON schemas are still rejected', () => {
            expect(() => makeValidator({ type: 'number', 'x-raw': 1 })).to.throw(
                Error,
                'strict mode: unknown keyword: "x-raw"'
            );
        });
    });

    suite('JSON schema', () => {
        const jsonValidator = makeValidator<number>({
            type: 'number',
            exclusiveMinimum: 2,
            maximum: 13,
        });

        test('success', () => {
            expectTypeOf(jsonValidator).toEqualTypeOf<JuniperValidator<number>>();
            expect(jsonValidator.validate(5)).to.deep.equal({ value: 5 });
            expect(jsonValidator.is(13)).to.equal(true);
        });

        test('failure', () => {
            expect(jsonValidator.is(2)).to.equal(false);
            expect(jsonValidator.validate('5').issues!.map(issue => issue.message)).to.deep.equal([
                'must be number',
            ]);
        });
    });

    suite('is', () => {
        test('success', () => {
            for (const valid of valids) {
                expect(validator.is(valid)).to.equal(true);
                if (validator.is(valid)) {
                    expectTypeOf(valid).toEqualTypeOf<SchemaType<typeof schema>>();
                }
            }
        });

        test('failure', () => {
            for (const invalid of invalids) {
                expect(validator.is(invalid)).to.equal(false);
            }
        });
    });

    suite('assert', () => {
        suite('success', () => {
            test('Using custom assertion statement', () => {
                const assert: (x: unknown) => asserts x is ValidatorType<typeof validator> =
                    validator.assert;
                for (const valid of valids) {
                    assert(valid);
                    expectTypeOf(valid).toEqualTypeOf<SchemaType<typeof schema>>();
                }
            });

            test('Using assertion type', () => {
                const assert: AssertionType<typeof validator> = validator.assert;
                for (const valid of valids) {
                    assert(valid);
                    expectTypeOf(valid).toEqualTypeOf<SchemaType<typeof schema>>();
                }
            });
        });

        test('failure', () => {
            const assert: AssertionType<typeof validator> = validator.assert;
            for (const invalid of invalids) {
                expect(() => {
                    assert(invalid);
                }).to.throw(Error, 'Value does not match schema');
            }

            let thrown: unknown;
            try {
                assert([]);
            } catch (err) {
                thrown = err;
            }
            expect(thrown).to.be.an.instanceOf(Error, 'Value does not match schema');
            const cause = (thrown as Error).cause as { message: string }[];
            expect(cause.map(issue => issue.message)).to.deep.equal([
                'must be number',
                'must be string',
                'must match a schema in anyOf',
            ]);
        });
    });

    test('Validates standard formats', () => {
        const email = makeValidator(stringSchema({ format: 'email' }));
        expect(email.is('ann@example.com')).to.equal(true);
        expect(email.is('not an email')).to.equal(false);

        const uuid = makeValidator(stringSchema({ format: 'uuid' }));
        expect(uuid.is('3f2c0a3e-6e8a-4a59-9c2b-1d2f3a4b5c6d')).to.equal(true);
        expect(uuid.is('123')).to.equal(false);
    });

    test('Validates open tuples', () => {
        const tuple = makeValidator(arraySchema().prefixItem(stringSchema()));
        expect(tuple.is(['a'])).to.equal(true);
        expect(tuple.is(['a', 1])).to.equal(true);
        expect(tuple.is([1])).to.equal(false);

        // Still opt in to Ajv's check
        expect(() =>
            makeValidator(arraySchema().prefixItem(stringSchema()), { strictTuples: true })
        ).to.throw('strict mode: "prefixItems" is 1-tuple');
    });

    test('Validates discriminated oneOf', () => {
        const pet = makeValidator(
            objectSchema().oneOf(
                [
                    objectSchema({
                        properties: { kind: enumSchema({ enum: ['a'] as const }) },
                        required: ['kind'],
                    }),
                    objectSchema({
                        properties: {
                            kind: enumSchema({ enum: ['b'] as const }),
                            b: numberSchema(),
                        },
                        required: ['kind', 'b'],
                    }),
                ],
                { discriminator: 'kind' }
            )
        );

        expect(pet.is({ kind: 'a' })).to.equal(true);
        expect(pet.is({ kind: 'b', b: 1 })).to.equal(true);
        expect(pet.is({ kind: 'b' })).to.equal(false);
        expect(pet.is({ kind: 'c' })).to.equal(false);
    });
});

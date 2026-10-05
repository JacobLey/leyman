import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { SchemaType } from 'juniper';
import type { AssertionType, JuniperValidator, ValidatorType } from 'juniper-validator';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { mergeSchema, numberSchema, stringSchema } from 'juniper';
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
});

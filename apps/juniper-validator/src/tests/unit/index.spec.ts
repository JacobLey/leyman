import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { SchemaType } from 'juniper';
import type { AssertionType, ValidatorType } from 'juniper-validator';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
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
});

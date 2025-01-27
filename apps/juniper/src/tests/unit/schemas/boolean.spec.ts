import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { booleanSchema, type SchemaType } from 'juniper';
import { suite, test } from 'mocha-chain';

suite('BooleanSchema', () => {
    suite('nullable', () => {
        test('success', () => {
            const schema = booleanSchema().nullable().toJSON();

            expect(schema).to.deep.equal({
                type: ['boolean', 'null'],
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<boolean | null>();
            const validator = new Ajv2020({ strict: true }).compile(schema);
            expect(validator(true)).to.equal(true);
            expect(validator(null)).to.equal(true);
        });
    });

    suite('toJSON', () => {
        test('success', () => {
            const schema = booleanSchema().toJSON();

            expect(schema).to.deep.equal({
                type: 'boolean',
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<boolean>();
            const validator = new Ajv2020({ strict: true }).compile(schema);
            expect(validator(true)).to.equal(true);
            expect(validator(null)).to.equal(false);
        });
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const schema = booleanSchema();

            expectTypeOf<(typeof schema)['allOf']>().toBeNever();
            expectTypeOf<(typeof schema)['anyOf']>().toBeNever();
            expectTypeOf<(typeof schema)['if']>().toBeNever();
            expectTypeOf<(typeof schema)['not']>().toBeNever();
            expectTypeOf<(typeof schema)['oneOf']>().toBeNever();
        });
    });
});

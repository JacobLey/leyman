import type { SchemaType } from 'juniper';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { booleanSchema } from 'juniper';
import { suite, test } from 'mocha-chain';
import { compile } from '../../ajv.js';

suite('BooleanSchema', () => {
    suite('nullable', () => {
        test('success', () => {
            const schema = booleanSchema().nullable().toJSON();

            expect(schema).to.deep.equal({
                type: ['boolean', 'null'],
            });
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<boolean | null>();
            const validator = compile(schema);
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
            const validator = compile(schema);
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

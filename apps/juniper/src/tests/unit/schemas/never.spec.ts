import AjvDefault from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { defaultImport } from 'default-import';
import { neverSchema, type SchemaType } from 'juniper';
import { suite, test } from 'mocha-chain';

const Ajv = defaultImport(AjvDefault);

suite('NeverSchema', () => {
    suite('toJSON', () => {
        test('success', () => {
            const schema = neverSchema().toJSON();

            expect(schema).to.deep.equal({
                not: {},
            });
            const validator = new Ajv({ strict: true }).compile<SchemaType<typeof schema>>(schema);
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<never>();
            expect(validator(null)).to.equal(false);
        });
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const schema = neverSchema();

            expectTypeOf<(typeof schema)['allOf']>().toBeNever();
            expectTypeOf<(typeof schema)['anyOf']>().toBeNever();
            expectTypeOf<(typeof schema)['if']>().toBeNever();
            expectTypeOf<(typeof schema)['not']>().toBeNever();
            expectTypeOf<(typeof schema)['nullable']>().toBeNever();
            expectTypeOf<(typeof schema)['oneOf']>().toBeNever();
        });
    });
});

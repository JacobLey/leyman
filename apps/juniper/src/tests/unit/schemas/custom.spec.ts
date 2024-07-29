import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { customSchema, type SchemaType } from 'juniper';
import { suite, test } from 'mocha-chain';
import type { AvailableProperties } from '../../types.js';

suite('CustomSchema', () => {
    test('Custom schema + type', () => {
        const sym = Symbol('sym');

        const externalSchema = {
            notValidSchema: true,
            _randomVal: 123,
            [sym]: sym,
        };

        const schema = customSchema<'abc' | number>(externalSchema);

        expect(schema.toJSON()).to.deep.equal(externalSchema);
        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<'abc' | number>();
    });

    test('Default empty object', () => {
        const schema = customSchema().toJSON();

        expect(schema).to.deep.equal({});
        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<unknown>();
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            const schema = customSchema();

            expectTypeOf<AvailableProperties<typeof schema>>().toEqualTypeOf<'cast' | 'toJSON'>();
        });
    });
});

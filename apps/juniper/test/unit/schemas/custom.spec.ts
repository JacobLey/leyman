import type { SchemaType } from 'juniper';
import type { AvailableProperties } from '../../types.js';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { customSchema } from 'juniper';
import { suite, test } from 'mocha-chain';

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

    test('Changes to the input or output do not change the schema', () => {
        const externalSchema = { type: 'object', required: ['a'] };
        const schema = customSchema(externalSchema);

        externalSchema.required.push('b');
        (schema.toJSON() as { required: string[] }).required.push('c');

        expect(schema.toJSON()).to.deep.equal({ type: 'object', required: ['a'] });
    });

    test('Default empty object', () => {
        const schema = customSchema().toJSON();

        expect(schema).to.deep.equal({});
        expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<unknown>();
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Only its type is asserted
            const schema = customSchema();

            expectTypeOf<AvailableProperties<typeof schema>>().toEqualTypeOf<
                '~standard' | 'cast' | 'toJSON'
            >();
        });
    });
});

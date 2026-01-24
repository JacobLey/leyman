import type { SchemaType } from 'juniper';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { nullSchema } from 'juniper';
import { suite, test } from 'mocha-chain';

suite('NullSchema', () => {
    suite('toJSON', () => {
        test('success', () => {
            const schema = nullSchema().toJSON();

            expect(schema).to.deep.equal({
                type: 'null',
            });
            const validator = new Ajv2020({ strict: true }).compile<SchemaType<typeof schema>>(
                schema
            );
            expectTypeOf<SchemaType<typeof schema>>().toEqualTypeOf<null>();
            expect(validator(null)).to.equal(true);
        });

        test('openApi30', () => {
            const schema = nullSchema({
                description: 'type null is not supported',
            }).toJSON({ openApi30: true });

            expect(schema).to.deep.equal({
                enum: [null],
                description: 'type null is not supported',
            });
            const validator = new Ajv2020({ strict: true }).compile<SchemaType<typeof schema>>(
                schema
            );
            expect(validator(null)).to.equal(true);
        });
    });

    suite('Invalid types', () => {
        test('Blocked methods', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const schema = nullSchema();

            expectTypeOf<(typeof schema)['if']>().toBeNever();
            expectTypeOf<(typeof schema)['not']>().toBeNever();
            expectTypeOf<(typeof schema)['nullable']>().toBeNever();
        });
    });
});

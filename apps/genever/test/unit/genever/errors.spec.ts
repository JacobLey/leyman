import type { ErrorCase } from '@leyman/genever-vectors';
import { expect } from '@leyman/expect';
import { invalidSchemas, strictSchemas, unsupportedSchemas } from '@leyman/genever-vectors';
import {
    genever,
    GeneverError,
    GeneverInvalidSchemaError,
    GeneverStrictModeError,
    GeneverUnsupportedError,
} from 'genever';
import { suite, test } from 'mocha-chain';

suite('errors', () => {
    suite('error details', () => {
        const invalid = { type: 'object', properties: { a: { type: 'foo' } } };

        test('extends GeneverError', () => {
            expect(() => genever(invalid)).to.throw(GeneverError);
        });

        test('has a name', () => {
            expect(() => genever(invalid))
                .to.throw(GeneverInvalidSchemaError)
                .with.property('name', 'GeneverInvalidSchemaError');
        });

        test('has a pointer to the problem', () => {
            expect(() => genever(invalid))
                .to.throw(GeneverInvalidSchemaError)
                .with.property('pointer', '#/properties/a/type');
        });
    });

    /**
     * Expect each case to throw its kind of error, at its pointer.
     *
     * @param cases - schemas genever rejects
     * @param errorClass - the error they throw
     */
    const expectErrors = (
        cases: Readonly<Record<string, ErrorCase>>,
        errorClass: typeof GeneverInvalidSchemaError
    ): void => {
        for (const [name, { schema, options, pointer }] of Object.entries(cases)) {
            test(name, () => {
                expect(() => genever(schema, options))
                    .to.throw(errorClass)
                    .with.property('pointer', pointer);
            });
        }
    };

    suite('invalid schema', () => {
        expectErrors(invalidSchemas, GeneverInvalidSchemaError);
    });

    suite('strict mode', () => {
        expectErrors(strictSchemas, GeneverStrictModeError);

        for (const [name, { schema, options }] of Object.entries(strictSchemas)) {
            test(`${name} is accepted with strict mode off`, () => {
                expect(() => genever(schema, { ...options, strict: false })).not.to.throw();
            });
        }

        test('extension keywords are allowed', () => {
            expect(() => genever({ type: 'string', 'x-foo': 1 })).not.to.throw();
        });

        test('number keywords apply to integers', () => {
            expect(() => genever({ type: 'integer', minimum: 0 })).not.to.throw();
        });
    });

    suite('unsupported', () => {
        expectErrors(unsupportedSchemas, GeneverUnsupportedError);
    });
});

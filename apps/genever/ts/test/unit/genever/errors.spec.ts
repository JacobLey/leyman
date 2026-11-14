import type { ErrorCase } from '@leyman/genever-test-vectors';
import { expect } from '@leyman/expect';
import { invalidSchemas, strictSchemas, unsupportedSchemas } from '@leyman/genever-test-vectors';
import {
    genever,
    GeneverError,
    GeneverInvalidSchemaError,
    geneverSource,
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

        for (const key of ['a/b~c', '', 'a b%é"#[]', '\u{1F600}', "-._~!$&'()*+,;=:@?"]) {
            test(`the pointer is a $ref to the same schema, for ${JSON.stringify(key)}`, () => {
                let pointer = '';
                try {
                    genever({ type: 'object', properties: { [key]: { type: 'date' } } });
                } catch (error) {
                    ({ pointer } = error as GeneverError);
                }
                expect(pointer).to.match(/\/type$/v);
                const propertyPointer = pointer.slice(0, -'/type'.length);

                const { names } = geneverSource({
                    type: 'object',
                    properties: { [key]: { type: 'string' }, r: { $ref: propertyPointer } },
                });
                // The referenced property is a named type, at the same pointer
                expect(names.map(name => name.pointer)).to.include(propertyPointer);
            });
        }
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

        test('a discriminator mapping to a component name with ~ or % resolves', () => {
            const pet = {
                type: 'object',
                properties: { kind: { type: 'string' } },
                required: ['kind'],
            };
            expect(() =>
                genever({
                    openapi: '3.1.0',
                    info: { title: 'API', version: '1.0.0' },
                    components: {
                        schemas: {
                            'a~0%b': pet,
                            Pet: {
                                ...pet,
                                discriminator: { propertyName: 'kind', mapping: { a: 'a~0%b' } },
                            },
                        },
                    },
                })
            ).not.to.throw();
        });

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

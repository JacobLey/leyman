import type { DecantOptions } from 'decant';
import type { Schema } from 'juniper';
import { expect } from '@leyman/expect';
import { decant } from 'decant';
import {
    arraySchema,
    components,
    enumSchema,
    numberSchema,
    objectSchema,
    stringSchema,
} from 'juniper';
import { suite, test } from 'mocha-chain';
import {
    assertionImports,
    equivalentAssertion,
    expectDecanted,
    normalizeModule,
} from '../lib/expect-decanted.js';
import { typeCheck } from '../lib/type-check.js';
import * as fixtures from './fixtures/juniper-schemas.js';
import * as openApiFixtures from './fixtures/openapi-schemas.js';

/**
 * Serialize a Juniper schema, decant it, and check the generated type is equivalent to Juniper's.
 *
 * @param name - name of the schema exported by the fixtures
 * @param options - decant options
 * @param serialize - render the schema as JSON
 */
const expectRoundTrip = (
    name: string,
    options: DecantOptions,
    serialize: (schema: Schema<unknown>) => unknown
): void => {
    const schema = fixtures[name as keyof typeof fixtures] as Schema<unknown>;
    // Only the serialized text survives, as if read from a file
    // eslint-disable-next-line unicorn/prefer-structured-clone
    const json: unknown = JSON.parse(JSON.stringify(serialize(schema)));
    const source = decant(json, options);
    const assertion = [
        ...assertionImports,
        "import type { SchemaType } from 'juniper';",
        "import type * as fixtures from '../integration/fixtures/juniper-schemas.js';",
        "import type { Schema } from './decanted.js';",
        equivalentAssertion('Schema', `SchemaType<typeof fixtures.${name}>`),
    ].join('\n');

    expect(
        typeCheck({
            'assertion.ts': assertion,
            'decanted.ts': source,
            'normalize.ts': normalizeModule,
        }),
        `Generated:\n${source}`
    ).to.deep.equal([]);
};

/**
 * Schemas that render the same types in OpenAPI 3.0.
 * Others use keywords OpenAPI 3.0 lacks (e.g. `prefixItems`), or definitions, which it keeps outside the schema.
 */
const openApi30Schemas = new Set<keyof typeof fixtures>([
    'string',
    'startsWith',
    'nullableString',
    'integer',
    'enumValues',
    'array',
    'nestedArray',
    'object',
    'nullableObject',
    'openObject',
    'recordObject',
    'anyOf',
    'oneOf',
    'allOf',
]);

suite('round trip', () => {
    suite('JSON Schema 2020-12', () => {
        for (const name of Object.keys(fixtures)) {
            test(name, () => {
                expectRoundTrip(name, {}, schema => schema.toJSON());
            });
        }
    });

    suite('OpenAPI 3.0', () => {
        for (const name of openApi30Schemas) {
            test(name, () => {
                expectRoundTrip(name, { openApi30: true }, schema =>
                    schema.toJSON({ openApi30: true })
                );
            });
        }
    });

    suite('OpenAPI documents', () => {
        const versions = [
            { openapi: '3.0.3', options: { openApi30: true } },
            { openapi: '3.1.0', options: { definitionsPath: '#/components/schemas/' } },
        ] as const;
        for (const { openapi, options } of versions) {
            test(openapi, () => {
                const document = {
                    openapi,
                    info: { title: 'API', version: '1.0.0' },
                    paths: {},
                    components: {
                        schemas: components([openApiFixtures.user, openApiFixtures.tree], options),
                    },
                };
                // eslint-disable-next-line unicorn/prefer-structured-clone
                const source = decant(JSON.parse(JSON.stringify(document)));
                const assertion = [
                    ...assertionImports,
                    "import type { SchemaType } from 'juniper';",
                    "import type * as fixtures from '../integration/fixtures/openapi-schemas.js';",
                    "import type { Address, TreeNode, User } from './decanted.js';",
                    equivalentAssertion('Address', 'SchemaType<typeof fixtures.address>'),
                    equivalentAssertion('User', 'SchemaType<typeof fixtures.user>'),
                    equivalentAssertion('TreeNode', 'SchemaType<typeof fixtures.tree>'),
                ].join('\n');

                expect(
                    typeCheck({
                        'assertion.ts': assertion,
                        'decanted.ts': source,
                        'normalize.ts': normalizeModule,
                    }),
                    `Generated:\n${source}`
                ).to.deep.equal([]);
            });
        }
    });

    /**
     * Where decant deliberately generates a different type than Juniper infers.
     */
    suite('differences from Juniper', () => {
        test('a property set to false in else can not be set', () => {
            const schema = objectSchema({
                properties: { kind: stringSchema(), value: numberSchema() },
            }).if(
                objectSchema({
                    properties: { kind: enumSchema().enum('number' as const) },
                    required: ['kind'],
                }),
                {
                    // eslint-disable-next-line unicorn/no-thenable
                    then: objectSchema({
                        properties: { value: numberSchema() },
                        required: ['value'],
                    }),
                    else: objectSchema({ properties: { value: false } }),
                }
            );

            expectDecanted(schema.toJSON(), {
                Schema: '{ kind: "number"; value: number } | { kind?: string; value?: never }',
            });
        });

        test('an object without properties is any object, not an empty object', () => {
            expectDecanted(objectSchema().toJSON(), { Schema: 'Record<string, unknown>' });
        });

        test('prefix items beyond minItems are optional', () => {
            expectDecanted(arraySchema().prefixItem(stringSchema()).toJSON(), {
                Schema: '[string?, ...unknown[]]',
            });
        });
    });
});

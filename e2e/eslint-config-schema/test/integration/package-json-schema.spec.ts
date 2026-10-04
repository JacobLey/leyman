import type { PackageJson } from '@leyman/eslint-config/package-json-schema';
import type { SchemaType } from 'juniper';
import { expectTypeOf } from 'expect-type';
import { packageJsonSchema } from '@leyman/eslint-config/package-json-schema';
import { expect } from '@leyman/expect';
import { objectSchema, stringSchema } from 'juniper';
import { suite, test } from 'mocha-chain';

const dependenciesSchema = objectSchema({
    additionalProperties: stringSchema(),
});

const juniperSchema = objectSchema({
    properties: {
        name: stringSchema(),
        dependencies: dependenciesSchema,
        devDependencies: dependenciesSchema,
        optionalDependencies: dependenciesSchema,
        peerDependencies: dependenciesSchema,
    },
    required: ['name'],
});

suite('package.json schema', () => {
    test('Matches the schema juniper builds', () => {
        expect(packageJsonSchema).to.deep.equal(juniperSchema.toJSON());
    });

    test('Type matches the type juniper infers', () => {
        expectTypeOf<PackageJson>().branded.toEqualTypeOf<SchemaType<typeof juniperSchema>>();
    });
});

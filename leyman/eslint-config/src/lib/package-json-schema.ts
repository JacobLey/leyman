import DefaultAjv from 'ajv/dist/2020.js';
import { defaultImport } from 'npm-default-import';
import { objectSchema, type SchemaType, stringSchema } from 'npm-juniper';

const Ajv = defaultImport(DefaultAjv);

const dependenciesSchema = objectSchema({
    additionalProperties: stringSchema(),
});

const packageJsonSchema = objectSchema({
    properties: {
        name: stringSchema(),
        dependencies: dependenciesSchema,
        devDependencies: dependenciesSchema,
        optionalDependencies: dependenciesSchema,
        peerDependencies: dependenciesSchema,
    },
    required: ['name'],
});
export type PackageJson = SchemaType<typeof packageJsonSchema>;

const validator = new Ajv({ strict: true }).compile<PackageJson>(packageJsonSchema.toJSON());

type PackageJsonAsserter = (packageJson: unknown) => asserts packageJson is PackageJson;
export const assertIsPackageJson: PackageJsonAsserter = (
    packageJson: unknown
): asserts packageJson is PackageJson => {
    validator(packageJson);
    if (validator.errors) {
        throw new Error(
            `Not a valid package.json file: ${JSON.stringify(validator.errors, null, 2)}`
        );
    }
};

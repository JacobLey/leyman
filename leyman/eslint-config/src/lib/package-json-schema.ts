import { Ajv2020 } from 'ajv/dist/2020.js';

type Dependencies = Record<string, string>;

export interface PackageJson {
    name: string;
    dependencies?: Dependencies;
    devDependencies?: Dependencies;
    optionalDependencies?: Dependencies;
    peerDependencies?: Dependencies;
}

// Written out rather than built with juniper, which lints with this package, so depending on it would be circular.
// `e2e/eslint-config-schema` checks that both stay equivalent to what juniper would build.
const dependenciesSchema = {
    type: 'object',
    additionalProperties: { type: 'string' },
};

export const packageJsonSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        dependencies: dependenciesSchema,
        devDependencies: dependenciesSchema,
        optionalDependencies: dependenciesSchema,
        peerDependencies: dependenciesSchema,
    },
    required: ['name'],
};

const validator = new Ajv2020({ strict: true }).compile<PackageJson>(packageJsonSchema);

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

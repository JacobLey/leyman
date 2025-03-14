import { Ajv2020 } from 'ajv/dist/2020.js';
import {
    arraySchema,
    booleanSchema,
    enumSchema,
    mergeSchema,
    objectSchema,
    type SchemaType,
    stringSchema,
} from 'juniper';

const checkAndDryRunSchema = objectSchema({
    properties: {
        $schema: stringSchema({
            description: '',
            format: 'uri-reference',
        }).example(
            'https://raw.githubusercontent.com/JacobLey/leyman/refs/heads/main/apps/nx-dagger/src/generate/schema.json'
        ),
        check: booleanSchema({
            description:
                'Fails if dagger module is not already updated, will not overwrite. Defaults to true during CI, false otherwise.',
        }),
        dryRun: booleanSchema({
            description: 'Load files and content, but do not write anything.',
        }),
    },
});

const parameterNames = enumSchema({
    enum: [
        'source',
        'output',
        'projectDir',
        'projectSource',
        'projectOutput',
        'dependencyProjectDirectories',
        'directDependencyProjectDirectories',
    ] as const,
});
export type ParameterNames = SchemaType<typeof parameterNames>;
const parameterSchemas = arraySchema(parameterNames).uniqueItems(true);

const prePostBuild = objectSchema({
    properties: {
        name: stringSchema(),
        constructorArguments: arraySchema(stringSchema()),
        parameters: parameterSchemas,
    },
    required: ['name', 'constructorArguments', 'parameters'],
});

const daggerOptionsSchema = checkAndDryRunSchema
    .properties({
        constructorArguments: objectSchema({
            properties: {},
            additionalProperties: enumSchema({ enum: ['string', 'int'] as const }),
        }),
        dagger: objectSchema({
            properties: {
                directory: stringSchema(),
                name: stringSchema(),
            },
            required: ['directory', 'name'],
        }),
        runtimes: objectSchema({
            properties: {},
            additionalProperties: objectSchema({
                properties: {
                    preBuild: prePostBuild,
                    postBuild: prePostBuild,
                },
                required: ['preBuild', 'postBuild'],
            }),
        }),
        targets: objectSchema({
            properties: {},
            additionalProperties: objectSchema({
                properties: {
                    pluginNames: arraySchema(stringSchema()).uniqueItems(true).minItems(1),
                    constructorArguments: arraySchema(stringSchema()).uniqueItems(true),
                    kind: enumSchema({ enum: ['ci', 'transform'] as const }),
                    parameters: parameterSchemas,
                },
                required: ['constructorArguments', 'kind', 'parameters'],
            }),
        }),
    })
    .required(['constructorArguments', 'dagger', 'runtimes', 'targets'])
    .additionalProperties(false);
export type DaggerOptions = SchemaType<typeof daggerOptionsSchema>;
export const isDaggerOptions = new Ajv2020({
    strict: true,
    formats: { 'uri-reference': true },
}).compile<DaggerOptions>(daggerOptionsSchema.toJSON());

const daggerOptionsOrConfigSchema = mergeSchema().oneOf([
    daggerOptionsSchema,
    checkAndDryRunSchema
        .properties({
            cwd: stringSchema(),
            configFile: stringSchema(),
        })
        .additionalProperties(false),
]);

export default daggerOptionsOrConfigSchema
    .metadata({
        version: 1,
        outputCapture: 'direct-nodejs',
        cli: 'nx',
    })
    .toJSON();
export type DaggerOptionsOrConfig = SchemaType<typeof daggerOptionsOrConfigSchema>;

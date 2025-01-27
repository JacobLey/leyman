import {
    arraySchema,
    booleanSchema,
    mergeSchema,
    objectSchema,
    type SchemaType,
    stringSchema,
} from 'juniper';
import { dependsOnSchema } from '#schemas';
import { ajv } from '../schemas/lib/ajv.js';

const checkAndDryRunSchema = objectSchema({
    properties: {
        $schema: stringSchema({
            description: '',
            format: 'uri-reference',
        }).example(
            'https://raw.githubusercontent.com/JacobLey/leyman/refs/heads/main/apps/nx-lifecycle/src/lifecycle/schema.json'
        ),
        check: booleanSchema({
            description:
                'Fails if references are not already updated, will not overwrite. Defaults to true during CI, false otherwise.',
        }),
        dryRun: booleanSchema({
            description: 'Load files and content, but do not write anything.',
        }),
    },
});

const lifecycleOptionsSchema = checkAndDryRunSchema
    .title('lifecycle')
    .description('Inject Nx targets as high level workflows')
    .properties({
        stages: objectSchema({
            description: 'Lifecycle stages by name',
            properties: {},
            additionalProperties: objectSchema({
                properties: {
                    dependsOn: dependsOnSchema,
                    hooks: arraySchema(stringSchema()),
                },
            }),
        }),
        bindings: objectSchema({
            description: 'Bind targets to hooks',
            properties: {},
            additionalProperties: stringSchema({
                description: 'Name of hook in `stage:hook` format',
            }),
        }),
    })
    .required(['stages', 'bindings'])
    .additionalProperties(false);
export type LifecycleOptions = SchemaType<typeof lifecycleOptionsSchema>;
export const isLifecycleOptions = ajv.compile<LifecycleOptions>(lifecycleOptionsSchema.toJSON());

const lifecycleOptionsOrConfigSchema = mergeSchema().oneOf([
    lifecycleOptionsSchema,
    checkAndDryRunSchema
        .properties({
            configFile: stringSchema(),
            cwd: stringSchema(),
        })
        .additionalProperties(false),
]);

export default lifecycleOptionsOrConfigSchema
    .metadata({
        version: 1,
        outputCapture: 'direct-nodejs',
        cli: 'nx',
    })
    .toJSON();
export type LifecycleOptionsOrConfig = SchemaType<typeof lifecycleOptionsOrConfigSchema>;

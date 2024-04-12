import {
    arraySchema,
    booleanSchema,
    objectSchema,
    type SchemaType,
    stringSchema,
} from 'juniper';
import { dependsOnSchema } from '#schemas';

const lifecycleOptionsSchema = objectSchema({
    title: 'lifecycle',
    description: 'Update TSConfig references based on dependencies',
    properties: {
        check: booleanSchema({
            description:
                'Fails if references are not already updated, will not overwrite. Defaults to true during CI, false otherwise.',
        }),
        dryRun: booleanSchema({
            description: 'Load files and content, but do not write anything.',
        }),
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
        targets: objectSchema({
            description: 'Targets that are registered to hooks',
            properties: {},
            additionalProperties: stringSchema({
                description: 'Name of hook in `stage:hook` format',
            }),
        }),
    },
    additionalProperties: false,
}).metadata({
    version: 1,
    outputCapture: 'direct-nodejs',
    cli: 'nx',
});

export default lifecycleOptionsSchema.toJSON();
export type LifecycleOptions = SchemaType<typeof lifecycleOptionsSchema>;

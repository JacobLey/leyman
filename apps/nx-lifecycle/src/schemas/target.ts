import type { SchemaType } from 'juniper';
import { objectSchema, stringSchema } from 'juniper';
import { configurationsSchema } from './configurations.js';
import { dependsOnSchema } from './depend-on.js';

const targetSchema = objectSchema({
    properties: {
        executor: stringSchema(),
        dependsOn: dependsOnSchema,
        configurations: configurationsSchema,
    },
});

export type Target = SchemaType<typeof targetSchema>;

export const allTargetsSchema = objectSchema({
    additionalProperties: targetSchema,
});

export type AllTargets = SchemaType<typeof allTargetsSchema>;

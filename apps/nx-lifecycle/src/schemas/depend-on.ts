import type { SchemaType } from 'juniper';
import {
    arraySchema,
    booleanSchema,
    enumSchema,
    mergeSchema,
    neverSchema,
    objectSchema,
    stringSchema,
} from 'juniper';

const projectsSchema = mergeSchema().oneOf([arraySchema(stringSchema()), stringSchema()]);

const dependencyObject = objectSchema({
    properties: {
        target: stringSchema(),
        params: enumSchema({
            enum: ['forward', 'ignore'],
        }),
    },
    required: ['target'],
}).oneOf([
    // Nx forbids `dependencies` and `projects` together
    objectSchema({
        properties: {
            dependencies: booleanSchema(),
            projects: neverSchema(),
        },
    }),
    objectSchema({
        properties: {
            dependencies: neverSchema(),
            projects: projectsSchema,
        },
        required: ['projects'],
    }),
]);
export type DependencyObject = SchemaType<typeof dependencyObject>;

export const dependsOnSchema = arraySchema(mergeSchema().oneOf([stringSchema(), dependencyObject]));

export type DependsOn = SchemaType<typeof dependsOnSchema>;

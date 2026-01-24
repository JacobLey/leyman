import type { SchemaType } from 'juniper';
import {
    arraySchema,
    booleanSchema,
    enumSchema,
    mergeSchema,
    objectSchema,
    stringSchema,
} from 'juniper';

const dependencyObject = objectSchema({
    properties: {
        target: stringSchema(),
        params: enumSchema({
            enum: ['forward', 'ignore'],
        }),
    },
    required: ['target'],
}).oneOf([
    objectSchema({
        properties: {
            dependencies: booleanSchema(),
        },
    }),
    objectSchema({
        properties: {
            projects: mergeSchema().oneOf([arraySchema(stringSchema()), stringSchema()]),
        },
        required: ['projects'],
    }),
]);
export type DependencyObject = SchemaType<typeof dependencyObject>;

export const dependsOnSchema = arraySchema(mergeSchema().oneOf([stringSchema(), dependencyObject]));

export type DependsOn = SchemaType<typeof dependsOnSchema>;

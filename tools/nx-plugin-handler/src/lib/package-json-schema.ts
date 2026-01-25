import type { SchemaType } from 'juniper';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { objectSchema, stringSchema } from 'juniper';

const ajv = new Ajv2020({ strict: true });

const packageJsonSchema = objectSchema({
    properties: {
        executors: stringSchema().endsWith('.json'),
    },
    required: ['executors'],
    additionalProperties: true,
});
export const isPackageJson = ajv.compile<SchemaType<typeof packageJsonSchema>>(
    packageJsonSchema.toJSON()
);

const executorsJsonSchema = objectSchema({
    properties: {
        executors: objectSchema({
            additionalProperties: objectSchema({
                properties: {
                    implementation: stringSchema(),
                },
                required: ['implementation'],
                additionalProperties: true,
            }),
        }),
    },
    required: ['executors'],
});

export const isExecutorsJson = ajv.compile<SchemaType<typeof executorsJsonSchema>>(
    executorsJsonSchema.toJSON()
);

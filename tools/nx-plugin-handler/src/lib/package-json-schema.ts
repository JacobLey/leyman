import { objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const packageJsonSchema = objectSchema({
    properties: {
        executors: stringSchema().endsWith('.json'),
    },
    required: ['executors'],
    additionalProperties: true,
});
export const isPackageJson = makeValidator(packageJsonSchema).is;

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

export const isExecutorsJson = makeValidator(executorsJsonSchema).is;

import AjvDefault from 'ajv/dist/2020.js';
import { defaultImport } from 'npm-default-import';
import { objectSchema, type SchemaType, stringSchema } from 'npm-juniper';

const Ajv = defaultImport(AjvDefault);
const ajv = new Ajv({ strict: true });

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
    additionalProperties: objectSchema({
        properties: {
            implementation: stringSchema(),
        },
        required: ['implementation'],
        additionalProperties: true,
    }),
});

export const isExecutorsJson = ajv.compile<SchemaType<typeof executorsJsonSchema>>(
    executorsJsonSchema.toJSON()
);

import type { SchemaType } from 'juniper';
import type { PopulateFileParams } from 'populate-files';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { arraySchema, mergeSchema, objectSchema, stringSchema } from 'juniper';

const populateFileParam = objectSchema({
    properties: {
        filePath: stringSchema(),
        content: mergeSchema().cast<PopulateFileParams['content']>(),
    },
    required: ['filePath', 'content'],
});

const populateFileParams = mergeSchema().oneOf([
    populateFileParam,
    arraySchema({ items: populateFileParam }),
]);

export const isPopulateFileParams = new Ajv2020({ strict: true }).compile<
    SchemaType<typeof populateFileParams>
>(populateFileParams.toJSON());

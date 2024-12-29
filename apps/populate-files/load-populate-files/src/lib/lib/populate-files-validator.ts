import AjvDefault from 'ajv/dist/2020.js';
import { defaultImport } from 'default-import';
import { arraySchema, mergeSchema, objectSchema, type SchemaType, stringSchema } from 'juniper';
import type { PopulateFileParams } from 'populate-files';

const Ajv = defaultImport(AjvDefault);

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

export const isPopulateFileParams = new Ajv({ strict: true }).compile<
    SchemaType<typeof populateFileParams>
>(populateFileParams.toJSON());

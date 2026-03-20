import type { PopulateFileParams } from 'populate-files';
import { arraySchema, mergeSchema, objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

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

export const isPopulateFileParams = makeValidator(populateFileParams).is;

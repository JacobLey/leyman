import type { PopulateFileParams } from 'populate-files';
import { arraySchema, booleanSchema, mergeSchema, objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const populateFileParam = objectSchema({
    properties: {
        filePath: stringSchema(),
        content: mergeSchema().cast<PopulateFileParams['content']>(),
        signed: booleanSchema(),
    },
    required: ['filePath', 'content'],
    // The schema can't express "signed requires string content", populate-files checks that.
}).cast<PopulateFileParams>();

const populateFileParams = mergeSchema().oneOf([
    populateFileParam,
    arraySchema({ items: populateFileParam }),
]);

export const isPopulateFileParams = makeValidator(populateFileParams).is;

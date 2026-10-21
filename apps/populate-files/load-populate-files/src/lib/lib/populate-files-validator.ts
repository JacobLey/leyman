import type { PopulateFileParams } from 'populate-files';
import { arraySchema, booleanSchema, mergeSchema, objectSchema, stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const populateFileParam = objectSchema({
    properties: {
        filePath: stringSchema(),
        content: mergeSchema().cast<PopulateFileParams['content']>(),
        signed: booleanSchema(),
        manifestInputs: objectSchema({ additionalProperties: stringSchema() }),
    },
    required: ['filePath', 'content'],
    // The schema can't express "signed requires string content", populate-files checks that.
}).cast<PopulateFileParams>();

const populateFileParams = mergeSchema().oneOf([
    populateFileParam,
    arraySchema({ items: populateFileParam }),
]);

export const populateFileParamsValidator = makeValidator(populateFileParams);
